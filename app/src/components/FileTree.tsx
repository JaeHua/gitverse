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

const C = {
  bg: '#fafafa',
  branch: '#e5e5e5',
  depLine: '#d8b4fe',
  dirFill: '#e5e7eb',
  dirLabel: '#a1a1aa',
  fileLow: '#86efac',
  fileMid: '#fde68a',
  fileHigh: '#fca5a5',
  label: '#9ca3af',
  select: '#a78bfa',
  changed: '#fbbf24',
}

function isPlaying(i: number) { return i >= 0 }

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const prevIdx = useRef(currentCommitIndex)

  const fileState = useMemo(() => {
    const s = new Map<string, { exists: boolean; isNew: boolean; isModified: boolean }>()
    if (!isPlaying(currentCommitIndex)) {
      for (const n of nodes) s.set(n.id, { exists: true, isNew: false, isModified: false })
      return s
    }
    const active = new Set<string>()
    for (let i = 0; i <= currentCommitIndex; i++) {
      for (const f of commits[i].filesChanged || []) {
        if (!active.has(f)) { active.add(f); s.set(f, { exists: true, isNew: i === currentCommitIndex, isModified: false }) }
      }
    }
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
      const fs = fileState.get(node.id)
      if (!fs?.exists) continue
      const parts = node.path.split('/')
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const nm = parts[i], fp = parts.slice(0, i + 1).join('/')
        let ch = cur.children.find(c => c.name === nm)
        if (!ch) { ch = { name: nm, path: fp, heat: 0, risk: 'low', children: [], isNew: false, isModified: false }; cur.children.push(ch) }
        if (i === parts.length - 1) {
          ch.fileNode = node; ch.heat = node.heat; ch.risk = node.risk; ch.isNew = fs.isNew; ch.isModified = fs.isModified
        } else {
          ch.heat = Math.max(ch.heat, node.heat)
          if (node.risk === 'high') ch.risk = 'high'
          else if (node.risk === 'medium' && ch.risk !== 'high') ch.risk = 'medium'
        }
        cur = ch
      }
    }
    if (isPlaying(currentCommitIndex)) {
      const prune = (n: TreeNode): boolean => { n.children = n.children.filter(c => prune(c)); return n.children.length > 0 || !!n.fileNode }
      prune(root)
    }
    const srt = (n: TreeNode) => { n.children.sort((a, b) => (!a.fileNode && b.fileNode ? -1 : a.fileNode && !b.fileNode ? 1 : a.name.localeCompare(b.name))); n.children.forEach(srt) }
    srt(root)
    return root
  }, [nodes, fileState, currentCommitIndex])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const w = svgRef.current.clientWidth

    const defs = svg.append('defs')

    // Subtle shadow
    const sh = defs.append('filter').attr('id', 'sh').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%')
    sh.append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.5).attr('flood-color', '#000').attr('flood-opacity', 0.04)

    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -4 8 8').attr('refX', 7).attr('refY', 0)
      .attr('markerWidth', 3).attr('markerHeight', 3).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', C.depLine).attr('opacity', 0.5)

    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.08, 6]).on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(w / 2, 60).scale(1.1))

    const playing = isPlaying(currentCommitIndex)
    const fwd = currentCommitIndex > prevIdx.current

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([30, 58]).separation((a, b) => a.parent === b.parent ? 1 : 1.35)(root)

    const desc = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const pos = new Map(desc.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0 }]))

    // ---- TREE BRANCHES (slow extend when playing forward) ----
    const branchG = g.append('g')

    const branches = branchG.selectAll('path')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join('path')
      .attr('fill', 'none').attr('stroke', C.branch).attr('stroke-width', 1)
      .attr('stroke-linecap', 'round')

    if (playing && fwd) {
      // Slow branch extension effect
      branches.each(function () {
        const el = this as SVGPathElement
        d3.select(el).attr('d', d => d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(d))
        const len = el.getTotalLength()
        if (len === 0) return
        d3.select(el)
          .attr('stroke-dasharray', len)
          .attr('stroke-dashoffset', len)
          .transition().duration(1500).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0)
          .on('end', function () { d3.select(this).attr('stroke-dasharray', 'none') })
      })
    } else {
      branches.attr('d', d => d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(d))
    }

    // ---- DEPENDENCY EDGES ----
    g.append('g').selectAll('path')
      .data(edges.filter(e => pos.get(e.source) && pos.get(e.target)))
      .join('path')
      .attr('d', d => { const s = pos.get(d.source)!, t = pos.get(d.target)!; return `M${s.x},${s.y}C${(s.x + t.x) / 2},${s.y} ${(s.x + t.x) / 2},${t.y} ${t.x},${t.y}` })
      .attr('fill', 'none').attr('stroke', C.depLine).attr('stroke-width', d => Math.max(d.weight / 35, 0.3))
      .attr('stroke-opacity', 0.18).attr('marker-end', 'url(#arr)').style('pointer-events', 'none')

    // ---- NODES ----
    const nodeG = g.append('g').selectAll('g')
      .data(desc)
      .join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')

    // ---- DIRECTORY NODES (folder icon + label) ----
    const dirs = nodeG.filter(d => !d.data.fileNode && d.depth >= 1)
    dirs.append('rect')
      .attr('x', -8).attr('y', -5.5).attr('width', 16).attr('height', 11).attr('rx', 2.5)
      .attr('fill', C.dirFill).attr('stroke', C.branch).attr('stroke-width', 0.5)
      .attr('filter', 'url(#sh)')
    dirs.append('text')
      .attr('dy', -9).attr('text-anchor', 'middle')
      .text(d => d.data.name)
      .attr('font-size', d => d.depth === 1 ? '11px' : '10px')
      .attr('font-weight', d => d.depth === 1 ? '600' : '400')
      .attr('fill', d => d.depth === 1 ? '#6b7280' : C.dirLabel)
      .attr('font-family', 'system-ui, -apple-system, sans-serif')
      .style('pointer-events', 'none')

    // ---- FILE NODES (slow organic growth) ----
    const files = nodeG.filter(d => !!d.data.fileNode)
    const GROW_TIME = playing && fwd ? 2000 : 300

    files.append('circle')
      .attr('r', playing && fwd ? 0.1 : d => r(d.data.heat))
      .attr('fill', d => heatFill(d.data.heat))
      .attr('filter', 'url(#sh)')
      .attr('stroke', 'none').attr('stroke-width', 1.5)

    files.select('circle')
      .transition().duration(GROW_TIME).ease(d3.easeElasticOut.amplitude(0.6).period(0.8))
      .attr('r', d => r(d.data.heat))

    // Labels fade in after growth
    files.append('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (r(d.data.heat) + 10))
      .attr('text-anchor', 'middle')
      .text(d => truncate(d.data.name, 15))
      .attr('font-size', '8px').attr('fill', C.label).attr('font-family', 'ui-monospace, monospace')
      .attr('letter-spacing', '0.01em')
      .attr('opacity', 0)
      .transition().delay(GROW_TIME).duration(800)
      .attr('opacity', 0.5)

    // ---- ANIMATION: modified = slow breath pulse ----
    files.filter(d => d.data.isModified && !d.data.isNew)
      .select('circle')
      .transition().duration(2500).ease(d3.easeSinInOut)
      .attr('r', d => r(d.data.heat) * 1.12)
      .transition().duration(2500).ease(d3.easeSinInOut)
      .attr('r', d => r(d.data.heat))

    // ---- ANIMATION: new = gentle glow bloom ----
    files.filter(d => d.data.isNew)
      .select('circle')
      .attr('stroke', C.changed).attr('stroke-opacity', 0.6)
      .transition().delay(GROW_TIME).duration(4000)
      .attr('stroke-opacity', 0).attr('stroke', 'none')

    // ---- HOVER ----
    files.on('mouseenter', function (_e, d) {
      d3.select(this).select('circle').transition().duration(250)
        .attr('r', r(d.data.heat) + 4).attr('stroke', C.select).attr('stroke-width', 2.5)
      d3.select(this).select('text').transition().duration(200).attr('opacity', 0.9)
    })
    files.on('mouseleave', function (_e, d) {
      d3.select(this).select('circle').transition().duration(300)
        .attr('r', r(d.data.heat)).attr('stroke', 'none').attr('stroke-width', 1.5)
      d3.select(this).select('text').transition().duration(200)
        .attr('opacity', d.data.path === selectedNodeId ? 0.9 : 0.5)
    })
    files.on('click', (_e, d) => {
      onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
    })

    // Selected
    files.filter(d => d.data.path === selectedNodeId).select('circle').attr('stroke', C.select).attr('stroke-width', 2.5)
    files.filter(d => d.data.path === selectedNodeId).select('text').attr('opacity', 0.9).attr('font-weight', '500')

    // Changed file highlights (orange ring, fade)
    files.filter(d => changedFiles.includes(d.data.path)).select('circle')
      .attr('stroke', C.changed).attr('stroke-width', 2.5)
      .transition().delay(0).duration(3000)
      .attr('stroke-opacity', 0).attr('stroke', 'none')

    prevIdx.current = currentCommitIndex

  }, [treeData, edges, selectedNodeId, nodes.length, onNodeSelect, currentCommitIndex])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  const cnt = countFiles(treeData)
  const playing = isPlaying(currentCommitIndex)

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
