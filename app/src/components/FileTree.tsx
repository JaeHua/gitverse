'use client'

import { useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import { FileNode, DependencyEdge, CommitSnapshot } from '@/types/analysis'

interface Props {
  nodes: FileNode[]
  edges: DependencyEdge[]
  commits: CommitSnapshot[]
  selectedNodeId: string | null
  onNodeSelect: (id: string | null) => void
  changedFiles: string[]
  currentCommitIndex: number
  fileTimeline: Record<string, Array<{ date: string; type: string }>>
}

interface TreeNode {
  name: string; path: string; heat: number; risk: string
  fileNode?: FileNode; children: TreeNode[]
  isNew: boolean; isModified: boolean
}

const TAUPE = { branch: '#e5e5e5', dep: '#d8b4fe', dirFill: '#e5e7eb', dirLabel: '#a1a1aa', label: '#9ca3af', select: '#a78bfa', changed: '#fbbf24' }

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const setupRef = useRef(false)
  const prevIdx = useRef(currentCommitIndex)

  const fileState = useMemo(() => {
    const s = new Map<string, { exists: boolean; isNew: boolean; isModified: boolean }>()
    if (currentCommitIndex < 0) { for (const n of nodes) s.set(n.id, { exists: true, isNew: false, isModified: false }); return s }
    const active = new Set<string>()
    for (let i = 0; i <= currentCommitIndex; i++)
      for (const f of commits[i].filesChanged || [])
        if (!active.has(f)) { active.add(f); s.set(f, { exists: true, isNew: i === currentCommitIndex, isModified: false }) }
    for (const [fp, evs] of Object.entries(fileTimeline)) {
      if (s.has(fp)) continue
      for (const ev of evs) {
        const idx = commits.findIndex(c => Math.abs(new Date(c.date).getTime() - new Date(ev.date).getTime()) < 60000)
        if (idx >= 0 && idx <= currentCommitIndex) { active.add(fp); s.set(fp, { exists: true, isNew: idx === currentCommitIndex, isModified: false }); break }
      }
    }
    for (const f of changedFiles) if (s.has(f)) s.get(f)!.isModified = true
    return s
  }, [commits, fileTimeline, currentCommitIndex, changedFiles, nodes])

  const treeData = useMemo(() => {
    const root: TreeNode = { name: '', path: '', heat: 0, risk: 'low', children: [], isNew: false, isModified: false }
    for (const node of nodes) {
      const fs = fileState.get(node.id); if (!fs?.exists) continue
      const parts = node.path.split('/'); let cur = root
      for (let i = 0; i < parts.length; i++) {
        const nm = parts[i], fp = parts.slice(0, i + 1).join('/')
        let ch = cur.children.find(c => c.name === nm)
        if (!ch) { ch = { name: nm, path: fp, heat: 0, risk: 'low', children: [], isNew: false, isModified: false }; cur.children.push(ch) }
        if (i === parts.length - 1) {
          ch.fileNode = node; ch.heat = node.heat; ch.risk = node.risk; ch.isNew = fs.isNew; ch.isModified = fs.isModified
        } else { ch.heat = Math.max(ch.heat, node.heat); if (node.risk === 'high') ch.risk = 'high'; else if (node.risk === 'medium' && ch.risk !== 'high') ch.risk = 'medium' }
        cur = ch
      }
    }
    if (currentCommitIndex >= 0) { const prune = (n: TreeNode): boolean => { n.children = n.children.filter(c => prune(c)); return n.children.length > 0 || !!n.fileNode }; prune(root) }
    const srt = (n: TreeNode) => { n.children.sort((a, b) => (!a.fileNode && b.fileNode ? -1 : a.fileNode && !b.fileNode ? 1 : a.name.localeCompare(b.name))); n.children.forEach(srt) }
    srt(root); return root
  }, [nodes, fileState, currentCommitIndex])

  // ONE-TIME SETUP (zoom, defs, background)
  useEffect(() => {
    if (!svgRef.current || setupRef.current) return
    const svg = d3.select(svgRef.current)
    const w = svgRef.current!.clientWidth

    const defs = svg.append('defs')
    const sh = defs.append('filter').attr('id', 'sh').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%')
    sh.append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.5).attr('flood-color', '#000').attr('flood-opacity', 0.04)
    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -4 8 8').attr('refX', 7).attr('refY', 0)
      .attr('markerWidth', 3).attr('markerHeight', 3).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', TAUPE.dep).attr('opacity', 0.5)

    const g = svg.append('g')
    gRef.current = g as any

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.08, 6])
      .on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, 60).scale(1.1))

    setupRef.current = true
  }, [])

  // DYNAMIC UPDATE on every timeline change (smooth transitions)
  useEffect(() => {
    if (!gRef.current || nodes.length === 0) return

    const g = gRef.current
    const playing = currentCommitIndex >= 0
    const fwd = currentCommitIndex > prevIdx.current
    const ANIM = playing && fwd ? 2500 : 400

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([30, 58]).separation((a, b) => a.parent === b.parent ? 1 : 1.35)(root)

    const desc = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const pos = new Map(desc.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0, isFile: !!d.data.fileNode }]))

    // ---- Branches ----
    const branchSel = g.selectAll<SVGPathElement, d3.HierarchyPointLink<TreeNode>>('path.branch')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[], d => (d.source as any).data.path + '->' + (d.target as any).data.path)

    branchSel.exit()
      .transition().duration(600).attr('stroke-opacity', 0).remove()

    const branchEnter = branchSel.enter().append('path').attr('class', 'branch')
      .attr('fill', 'none').attr('stroke', TAUPE.branch).attr('stroke-width', 1).attr('stroke-linecap', 'round')

    if (playing && fwd) {
      branchEnter.each(function (d) {
        const el = this as SVGPathElement
        d3.select(el).attr('d', d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(d))
        const len = el.getTotalLength()
        if (len === 0) return
        d3.select(el).attr('stroke-dasharray', len).attr('stroke-dashoffset', len)
          .transition().duration(ANIM * 0.7).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0).on('end', function () { d3.select(this).attr('stroke-dasharray', 'none') })
      })
    } else {
      branchEnter.attr('d', d => d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(d))
    }

    branchSel.merge(branchEnter)
      .transition().duration(ANIM)
      .attr('d', d => d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(d))

    // ---- Dep edges ----
    const validEdges = edges.filter(e => pos.get(e.source) && pos.get(e.target))
    const depSel = g.selectAll<SVGPathElement, DependencyEdge>('path.dep')
      .data(validEdges, d => d.source + '->' + d.target)

    depSel.exit().transition().duration(400).attr('stroke-opacity', 0).remove()
    depSel.enter().append('path').attr('class', 'dep')
      .attr('fill', 'none').attr('stroke', TAUPE.dep).attr('stroke-width', d => Math.max(d.weight / 35, 0.3))
      .attr('stroke-opacity', 0).attr('marker-end', 'url(#arr)').style('pointer-events', 'none')
      .transition().duration(ANIM).attr('stroke-opacity', 0.18)
    depSel.merge(depSel)
      .transition().duration(ANIM)
      .attr('d', d => { const s = pos.get(d.source)!, t = pos.get(d.target)!; return `M${s.x},${s.y}C${(s.x + t.x) / 2},${s.y} ${(s.x + t.x) / 2},${t.y} ${t.x},${t.y}` })

    // ---- Nodes ----
    const nodeSel = g.selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>('g.node')
      .data(desc, d => d.data.path)

    // EXIT: fade out
    nodeSel.exit()
      .transition().duration(800).attr('opacity', 0).remove()

    // ENTER: build node structure
    const nodeEnter = nodeSel.enter().append('g').attr('class', 'node')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')
      .attr('opacity', 0)

    // Directory
    const dirEnter = nodeEnter.filter(d => !d.data.fileNode && d.depth >= 1)
    dirEnter.append('rect').attr('x', -8).attr('y', -5.5).attr('width', 16).attr('height', 11).attr('rx', 2.5)
      .attr('fill', TAUPE.dirFill).attr('stroke', TAUPE.branch).attr('stroke-width', 0.5).attr('filter', 'url(#sh)')
    dirEnter.append('text').attr('dy', -9).attr('text-anchor', 'middle').text(d => d.data.name)
      .attr('font-size', d => d.depth === 1 ? '11px' : '10px').attr('font-weight', d => d.depth === 1 ? '600' : '400')
      .attr('fill', d => d.depth === 1 ? '#6b7280' : TAUPE.dirLabel)
      .attr('font-family', 'system-ui, -apple-system, sans-serif').style('pointer-events', 'none')

    // File nodes
    const fileEnter = nodeEnter.filter(d => !!d.data.fileNode)
    fileEnter.append('circle').attr('r', playing && fwd ? 0.1 : d => r(d.data.heat))
      .attr('fill', d => heatFill(d.data.heat)).attr('filter', 'url(#sh)').attr('stroke', 'none').attr('stroke-width', 1.5)
    fileEnter.append('text').attr('text-anchor', 'middle')
      .text(d => truncate(d.data.name, 15)).attr('font-size', '8px').attr('fill', TAUPE.label)
      .attr('font-family', 'ui-monospace, monospace').attr('letter-spacing', '0.01em')
      .attr('opacity', 0)

    // Fade in all entered
    nodeEnter.transition().duration(300).attr('opacity', 1)

    // Grow animation for file circles
    fileEnter.select('circle')
      .transition().duration(ANIM).ease(d3.easeElasticOut.amplitude(0.5).period(0.7))
      .attr('r', d => r(d.data.heat))
    fileEnter.select('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (r(d.data.heat) + 10))
      .transition().delay(ANIM * 0.5).duration(600).attr('opacity', 0.5)

    // UPDATE: reposition existing
    const nodeMerge = nodeSel.merge(nodeEnter)
    nodeMerge.transition().duration(ANIM).ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)

    // Update file circles on merge
    const fileMerge = nodeMerge.filter(d => !!d.data.fileNode)
    fileMerge.select('circle')
      .transition().duration(ANIM).ease(d3.easeCubicInOut)
      .attr('r', d => r(d.data.heat)).attr('fill', d => heatFill(d.data.heat))
    fileMerge.select('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (r(d.data.heat) + 10))

    // New node glow
    fileMerge.filter(d => d.data.isNew).select('circle')
      .attr('stroke', TAUPE.changed).attr('stroke-opacity', 0.6)
      .transition().delay(ANIM).duration(4000)
      .attr('stroke-opacity', 0).attr('stroke', 'none')

    // Modified: slow breath pulse (only if not also new)
    fileMerge.filter(d => d.data.isModified && !d.data.isNew).select('circle')
      .transition().duration(2000).ease(d3.easeSinInOut)
      .attr('r', d => r(d.data.heat) * 1.12)
      .transition().duration(2000).ease(d3.easeSinInOut)
      .attr('r', d => r(d.data.heat))

    // Changed file highlights
    fileMerge.filter(d => changedFiles.includes(d.data.path)).select('circle')
      .attr('stroke', TAUPE.changed).attr('stroke-width', 2.5)
      .transition().duration(3000).attr('stroke-opacity', 0).attr('stroke', 'none')

    // Hover handlers on merge
    fileMerge.on('mouseenter', function (_e, d) {
      d3.select(this).select('circle').transition().duration(200)
        .attr('r', r(d.data.heat) + 4).attr('stroke', TAUPE.select).attr('stroke-width', 2.5)
      d3.select(this).select('text').transition().duration(200).attr('opacity', 0.9)
    })
    fileMerge.on('mouseleave', function (_e, d) {
      d3.select(this).select('circle').transition().duration(300)
        .attr('r', r(d.data.heat)).attr('stroke', 'none').attr('stroke-width', 1.5)
      d3.select(this).select('text').transition().duration(200)
        .attr('opacity', d.data.path === selectedNodeId ? 0.9 : 0.5)
    })
    fileMerge.on('click', (_e, d) => { if (d.data.fileNode) onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path) })

    // Selection
    fileMerge.filter(d => d.data.path === selectedNodeId).select('circle').attr('stroke', TAUPE.select).attr('stroke-width', 2.5)
    fileMerge.filter(d => d.data.path === selectedNodeId).select('text').attr('opacity', 0.9).attr('font-weight', '500')

    prevIdx.current = currentCommitIndex

  }, [treeData, edges, selectedNodeId, nodes.length, onNodeSelect, currentCommitIndex, changedFiles])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  const playing = currentCommitIndex >= 0
  const cnt = countFiles(treeData)

  return (
    <div className="w-full h-full relative bg-[#fafafa]">
      <svg ref={svgRef} className="w-full h-full" />
      {playing && (
        <div className="absolute top-4 left-4 text-[11px] text-zinc-400 font-medium tracking-wide select-none">
          文件 {cnt}/{nodes.length} &middot; {currentCommitIndex + 1}/{commits.length}
        </div>
      )}
    </div>
  )
}

function r(heat: number) { return 3 + Math.max(heat, 3) * 0.14 }
function heatFill(h: number) { return h > 60 ? '#fca5a5' : h > 30 ? '#fde68a' : '#a7f3d0' }
function countFiles(n: TreeNode): number { let c = n.fileNode ? 1 : 0; for (const x of n.children) c += countFiles(x); return c }
function truncate(s: string, max: number): string { return s.length > max ? s.slice(0, max - 2) + '..' : s }
