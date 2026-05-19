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

const C = { branch: '#e5e5e5', dep: '#d8b4fe', dirFill: '#e5e7eb', dirLabel: '#a1a1aa', label: '#9ca3af', select: '#a78bfa', glow: '#fbbf24' }

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const prevPaths = useRef<Set<string>>(new Set())
  const prevBranches = useRef<Set<string>>(new Set())
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

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    // Crossfade: fade out old content before removal
    const oldG = svg.select('g')
    if (!oldG.empty()) {
      oldG.transition().duration(200).attr('opacity', 0).remove()
    }
    svg.selectAll('defs').remove()
    const w = svgRef.current.clientWidth

    const defs = svg.append('defs')
    defs.append('filter').attr('id', 'sh').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%')
      .append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.5).attr('flood-color', '#000').attr('flood-opacity', 0.04)
    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -4 8 8').attr('refX', 7).attr('refY', 0)
      .attr('markerWidth', 3).attr('markerHeight', 3).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', C.dep).attr('opacity', 0.5)

    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.08, 6]).on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(w / 2, 60).scale(1.1))

    const playing = currentCommitIndex >= 0
    const fwd = currentCommitIndex > prevIdx.current
    const prevSet = prevPaths.current
    const prevBrSet = prevBranches.current
    const BRANCH_EXTEND = 1000
    const NODE_GROW = 1800

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([30, 58]).separation((a, b) => a.parent === b.parent ? 1 : 1.35)(root)

    const desc = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const currentPaths = new Set(desc.map(d => d.data.path))
    const pos = new Map(desc.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0, isFile: !!d.data.fileNode }]))

    const links = root.links() as d3.HierarchyPointLink<TreeNode>[]
    const currentBranches = new Set(links.map(l => (l.source as any).data.path + '/' + (l.target as any).data.path))

    // ---- BRANCHES: new ones extend, existing ones appear instantly ----
    const branchG = g.append('g')
    for (const link of links) {
      const key = (link.source as any).data.path + '/' + (link.target as any).data.path
      const isNewBranch = !prevBrSet.has(key)
      branchG.append('path')
        .attr('fill', 'none').attr('stroke', C.branch).attr('stroke-width', 1).attr('stroke-linecap', 'round')
        .attr('d', d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(link))
        .call(sel => {
          if (playing && fwd && isNewBranch) {
            const el = sel.node() as SVGPathElement
            const len = el.getTotalLength()
            if (len > 0) {
              sel.attr('stroke-dasharray', len).attr('stroke-dashoffset', len)
                .transition().duration(BRANCH_EXTEND).ease(d3.easeCubicInOut)
                .attr('stroke-dashoffset', 0)
                .transition().duration(300).attr('stroke-dasharray', 'none')
            }
          }
        })
    }

    // ---- DEP EDGES ----
    g.append('g').selectAll('path')
      .data(edges.filter(e => pos.get(e.source) && pos.get(e.target)))
      .join('path')
      .attr('d', d => { const s = pos.get(d.source)!, t = pos.get(d.target)!; return `M${s.x},${s.y}C${(s.x + t.x) / 2},${s.y} ${(s.x + t.x) / 2},${t.y} ${t.x},${t.y}` })
      .attr('fill', 'none').attr('stroke', C.dep).attr('stroke-width', d => Math.max(d.weight / 35, 0.3))
      .attr('stroke-opacity', 0.18).attr('marker-end', 'url(#arr)').style('pointer-events', 'none')

    // ---- DIRECTORIES ----
    const nodeG = g.append('g').selectAll('g')
      .data(desc).join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')

    nodeG.filter(d => !d.data.fileNode && d.depth >= 1)
      .append('rect').attr('x', -8).attr('y', -5.5).attr('width', 16).attr('height', 11).attr('rx', 2.5)
      .attr('fill', C.dirFill).attr('stroke', C.branch).attr('stroke-width', 0.5).attr('filter', 'url(#sh)')
    nodeG.filter(d => !d.data.fileNode && d.depth >= 1)
      .append('text').attr('dy', -9).attr('text-anchor', 'middle').text(d => d.data.name)
      .attr('font-size', d => d.depth === 1 ? '11px' : '10px').attr('font-weight', d => d.depth === 1 ? '600' : '400')
      .attr('fill', d => d.depth === 1 ? '#6b7280' : C.dirLabel)
      .attr('font-family', 'system-ui, -apple-system, sans-serif').style('pointer-events', 'none')

    // ---- FILE NODES ----
    const fileNodes = nodeG.filter(d => !!d.data.fileNode)
    const rad = (d: d3.HierarchyPointNode<TreeNode>) => r(d.data.heat)
    const isNew = (d: d3.HierarchyPointNode<TreeNode>) => !prevSet.has(d.data.path)
    const shouldAnimate = playing && fwd

    // Circles: existing = full size, new = grow from 0 delayed after branch extension
    fileNodes.append('circle')
      .attr('r', d => {
        if (!shouldAnimate) return rad(d)
        if (isNew(d)) return 0.1
        return rad(d)
      })
      .attr('fill', d => heatFill(d.data.heat)).attr('filter', 'url(#sh)')
      .attr('stroke', 'none').attr('stroke-width', 1.5)

    // Grow animation delayed after branch extension
    fileNodes.filter(d => isNew(d)).select('circle')
      .transition().delay(400).duration(NODE_GROW).ease(d3.easeElasticOut.amplitude(0.4).period(0.8))
      .attr('r', d => rad(d))

    // Labels
    fileNodes.append('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (rad(d) + 10))
      .attr('text-anchor', 'middle').text(d => truncate(d.data.name, 15))
      .attr('font-size', '8px').attr('fill', C.label).attr('font-family', 'ui-monospace, monospace')
      .attr('letter-spacing', '0.01em')
      .attr('opacity', d => (!shouldAnimate || !isNew(d)) ? 0.5 : 0)

    fileNodes.filter(d => isNew(d)).select('text')
      .transition().delay(400 + NODE_GROW * 0.5).duration(600).attr('opacity', 0.5)

    // ---- EFFECTS ----
    // New node glow (after growth)
    fileNodes.filter(d => d.data.isNew).select('circle')
      .attr('stroke', C.glow).attr('stroke-opacity', 0.6)
      .transition().delay(400 + NODE_GROW).duration(4000)
      .attr('stroke-opacity', 0).attr('stroke', 'none')

    // Modified breath (existing only)
    fileNodes.filter(d => d.data.isModified && !d.data.isNew).select('circle')
      .transition().duration(2200).ease(d3.easeSinInOut).attr('r', d => rad(d) * 1.12)
      .transition().duration(2200).ease(d3.easeSinInOut).attr('r', d => rad(d))

    // Changed highlight fade
    fileNodes.filter(d => changedFiles.includes(d.data.path)).select('circle')
      .attr('stroke', '#f59e0b').attr('stroke-width', 2.5)
      .transition().duration(3500).attr('stroke-opacity', 0).attr('stroke', 'none')

    // ---- INTERACTION ----
    fileNodes.on('mouseenter', function(_e, d) {
      d3.select(this).select('circle').transition().duration(200)
        .attr('r', rad(d) + 4).attr('stroke', C.select).attr('stroke-width', 2.5)
      d3.select(this).select('text').transition().duration(200).attr('opacity', 0.9)
    })
    fileNodes.on('mouseleave', function(_e, d) {
      d3.select(this).select('circle').transition().duration(300)
        .attr('r', rad(d)).attr('stroke', 'none').attr('stroke-width', 1.5)
      d3.select(this).select('text').transition().duration(200).attr('opacity', d.data.path === selectedNodeId ? 0.9 : 0.5)
    })
    fileNodes.on('click', (_e, d) => { if (d.data.fileNode) onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path) })

    // Selection
    fileNodes.filter(d => d.data.path === selectedNodeId).select('circle').attr('stroke', C.select).attr('stroke-width', 2.5)
    fileNodes.filter(d => d.data.path === selectedNodeId).select('text').attr('opacity', 0.9).attr('font-weight', '500')

    prevPaths.current = currentPaths
    prevBranches.current = currentBranches
    prevIdx.current = currentCommitIndex

  }, [treeData, edges, selectedNodeId, nodes.length, onNodeSelect, currentCommitIndex, changedFiles])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  const cnt = countFiles(treeData)

  return (
    <div className="w-full h-full relative bg-[#fafafa]">
      <svg ref={svgRef} className="w-full h-full" />
      {currentCommitIndex >= 0 && (
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
