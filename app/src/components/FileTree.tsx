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
  commitCount: number; fileNode?: FileNode; children: TreeNode[]
  addedAt: number; deletedAt: number
}

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const prevIndexRef = useRef(currentCommitIndex)

  // File lifecycle: when each file appeared and disappeared
  const fileLifecycle = useMemo(() => {
    const map = new Map<string, { addedAt: number; deletedAt: number }>()
    for (const [fp, events] of Object.entries(fileTimeline)) {
      let addedAt = -1, deletedAt = -1
      for (const ev of events) {
        const idx = commits.findIndex(c => Math.abs(new Date(c.date).getTime() - new Date(ev.date).getTime()) < 60000)
        if (idx >= 0) {
          if (ev.type === 'added' && addedAt < 0) addedAt = idx
          if (ev.type === 'deleted') deletedAt = idx
        }
      }
      map.set(fp, { addedAt, deletedAt })
    }
    // Files without timeline: find their first commit from filesChanged
    for (const node of nodes) {
      if (map.has(node.id)) continue
      let found = -1
      for (let i = 0; i < commits.length; i++) {
        if (commits[i].filesChanged?.includes(node.id)) { found = i; break }
      }
      map.set(node.id, { addedAt: found >= 0 ? found : 0, deletedAt: -1 })
    }
    return map
  }, [fileTimeline, commits, nodes])

  // Build filtered tree based on current timeline position
  const treeData = useMemo(() => {
    const root: TreeNode = { name: '', path: '', heat: 0, risk: 'low', commitCount: 0, children: [], addedAt: 0, deletedAt: -1 }

    for (const node of nodes) {
      const lc = fileLifecycle.get(node.id)
      if (!lc) continue
      // Filter: skip files not yet born at this commit, or already dead
      if (currentCommitIndex >= 0 && lc.addedAt > currentCommitIndex) continue
      if (currentCommitIndex >= 0 && lc.deletedAt >= 0 && lc.deletedAt <= currentCommitIndex) continue

      const parts = node.path.split('/')
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i], fp = parts.slice(0, i + 1).join('/')
        let child = cur.children.find(c => c.name === name)
        if (!child) {
          child = { name, path: fp, heat: 0, risk: 'low', commitCount: 0, children: [], addedAt: lc.addedAt, deletedAt: lc.deletedAt }
          cur.children.push(child)
        }
        if (i === parts.length - 1) {
          child.fileNode = node; child.heat = node.heat; child.risk = node.risk; child.commitCount = node.commitCount
        } else {
          if (node.heat > child.heat) child.heat = node.heat
          if (node.risk === 'high') child.risk = 'high'
          else if (node.risk === 'medium' && child.risk !== 'high') child.risk = 'medium'
          child.commitCount += node.commitCount
        }
        cur = child
      }
    }
    const sort = (n: TreeNode) => {
      n.children.sort((a, b) => (!a.fileNode && b.fileNode ? -1 : a.fileNode && !b.fileNode ? 1 : a.name.localeCompare(b.name)))
      n.children.forEach(sort)
    }
    sort(root)
    return root
  }, [nodes, fileLifecycle, currentCommitIndex])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const w = svgRef.current.clientWidth

    // Defs
    const defs = svg.append('defs')
    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -5 10 10').attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 4).attr('markerHeight', 4).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#3b82f6').attr('opacity', 0.35)

    const filter = defs.append('filter').attr('id', 'glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'b')
    filter.append('feMerge').selectAll('feMergeNode').data(['b', 'SourceGraphic']).join('feMergeNode').attr('in', d => d as string)

    const g = svg.append('g')
    gRef.current = g as any

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, 50).scale(1.2))
    zoomRef.current = zoom

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([30, 55]).separation((a, b) => (a.parent === b.parent ? 1 : 1.2))(root)

    const descendants = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const posMap = new Map(descendants.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0, isFile: !!d.data.fileNode }]))

    // Dependency edges
    const validEdges = edges.filter(e => posMap.get(e.source) && posMap.get(e.target))
    g.append('g').selectAll('path').data(validEdges).join('path')
      .attr('d', d => { const s = posMap.get(d.source)!, t = posMap.get(d.target)!; return `M${s.x},${s.y}C${(s.x + t.x) / 2},${(s.y + t.y) / 2} ${(s.x + t.x) / 2},${(s.y + t.y) / 2} ${t.x},${t.y}` })
      .attr('fill', 'none').attr('stroke', '#3b82f6')
      .attr('stroke-width', d => Math.max(d.weight / 30, 0.3))
      .attr('stroke-opacity', 0.15)
      .attr('marker-end', 'url(#arr)')
      .style('pointer-events', 'none')

    // Tree links
    g.append('g').selectAll('path')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join('path')
      .attr('d', d => d3.linkVertical<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>().x(n => n.x ?? 0).y(n => n.y ?? 0)(d as any))
      .attr('fill', 'none').attr('stroke', '#e4e4e7').attr('stroke-width', 0.6)
      .style('pointer-events', 'none')

    // ---- NODES WITH GROW ANIMATION ----
    const isPlaying = currentCommitIndex >= 0
    const playingForward = currentCommitIndex > prevIndexRef.current

    const nodeG = g.append('g').selectAll('g')
      .data(descendants)
      .join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')
      .attr('opacity', 0)
      .transition().duration(400)
      .attr('opacity', 1)

    const nodeGStatic = g.append('g').selectAll('g')
      .data(descendants)
      .join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')

    // Directory rects
    nodeGStatic.filter(d => !d.data.fileNode)
      .append('rect')
      .attr('x', -7).attr('y', -5).attr('width', 14).attr('height', 10).attr('rx', 2)
      .attr('fill', d => d.depth <= 2 ? '#a1a1aa' : '#d4d4d8').attr('opacity', 0.5)

    // Dir labels
    nodeGStatic.filter(d => !d.data.fileNode && d.depth <= 3)
      .append('text')
      .attr('dy', -9).attr('text-anchor', 'middle').text(d => d.data.name)
      .attr('font-size', d => d.depth <= 1 ? '12px' : '10px')
      .attr('font-weight', d => d.depth <= 1 ? '600' : '500')
      .attr('fill', '#a1a1aa').attr('font-family', 'system-ui')
      .style('pointer-events', 'none')

    // File circles - GROW effect for newly appearing nodes
    nodeGStatic.filter(d => !!d.data.fileNode)
      .append('circle')
      .attr('r', 0)
      .attr('fill', d => d.data.risk === 'high' ? '#ef4444' : d.data.risk === 'medium' ? '#eab308' : '#22c55e')
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'none').attr('stroke-width', 2)
      .transition().duration(isPlaying && playingForward ? 500 : 200)
      .attr('r', d => Math.max(4, d.data.heat / 7 + 4))

    // Newly appeared nodes get a glow pulse
    if (isPlaying && playingForward) {
      nodeGStatic.filter(d => !!d.data.fileNode && fileLifecycle.get(d.data.path)?.addedAt === currentCommitIndex)
        .select('circle')
        .attr('filter', 'url(#glow)')
        .transition().delay(500).duration(2000).attr('filter', null)
    }

    // File labels - alternating above/below
    nodeGStatic.filter(d => !!d.data.fileNode)
      .append('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (Math.max(4, d.data.heat / 7 + 4) + 10))
      .attr('text-anchor', 'middle').text(d => truncate(d.data.name, 14))
      .attr('font-size', '8px').attr('fill', '#71717a').attr('font-family', 'monospace')
      .attr('opacity', 0).transition().delay(300).duration(300).attr('opacity', 0.6)

    // Interaction handlers
    nodeGStatic.on('mouseenter', function(_e, d) {
      if (!d.data.fileNode) return
      d3.select(this).select('circle').transition().duration(150).attr('r', Math.max(4, d.data.heat / 7 + 4) + 3).attr('stroke', '#3b82f6').attr('stroke-width', 2.5)
      d3.select(this).select('text').transition().duration(150).attr('opacity', 1)
    })
    nodeGStatic.on('mouseleave', function(_e, d) {
      d3.select(this).select('circle').transition().duration(150).attr('r', Math.max(4, d.data.heat / 7 + 4)).attr('stroke', 'none')
      d3.select(this).select('text').transition().duration(150).attr('opacity', d.data.path === selectedNodeId ? 1 : 0.6)
    })
    nodeGStatic.on('click', (_e, d) => {
      if (d.data.fileNode) onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
    })

    // Persistent selection highlight
    nodeGStatic.filter(d => d.data.path === selectedNodeId).select('circle')
      .attr('stroke', '#3b82f6').attr('stroke-width', 2.5)
    nodeGStatic.filter(d => d.data.path === selectedNodeId).select('text').attr('opacity', 1).attr('font-weight', '700')

    // Timeline changed file highlights
    nodeGStatic.filter(d => changedFiles.includes(d.data.path) && !!d.data.fileNode)
      .select('circle')
      .attr('stroke', '#f59e0b').attr('stroke-width', 3)
      .transition().duration(300).attr('stroke-width', 3)

    // Auto-focus to changed area
    if (changedFiles.length > 0 && changedFiles.length <= 15 && zoomRef.current) {
      const pts = changedFiles.map(f => posMap.get(f)).filter(Boolean) as { x: number; y: number }[]
      if (pts.length > 0) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
        svg.transition().duration(700).call(
          zoomRef.current!.transform as any,
          d3.zoomIdentity.translate(w / 2 - cx * 1.3, 250 - cy * 1.3).scale(1.3)
        )
      }
    }

    prevIndexRef.current = currentCommitIndex

  }, [treeData, edges, selectedNodeId, changedFiles, nodes.length, fileLifecycle, onNodeSelect, currentCommitIndex])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  return (
    <div className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-3 right-3 flex gap-2 text-[10px]">
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />低</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />中</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />高</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />变更</span>
      </div>
      {currentCommitIndex >= 0 && (
        <div className="absolute top-3 left-3 text-xs text-zinc-400 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
          Commit {currentCommitIndex + 1}/{commits.length}
        </div>
      )}
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + '..' : s
}
