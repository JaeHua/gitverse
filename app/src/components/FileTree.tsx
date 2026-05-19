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
  name: string
  path: string
  heat: number
  risk: string
  commitCount: number
  fileNode?: FileNode
  children: TreeNode[]
  addedAt: number
  deletedAt: number
}

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const prevCommitRef = useRef(currentCommitIndex)
  const animRef = useRef<Map<string, { type: string; time: number }>>(new Map())

  const fileLifecycle = useMemo(() => {
    const map = new Map<string, { addedAt: number; deletedAt: number }>()
    for (const [filePath, events] of Object.entries(fileTimeline)) {
      let addedAt = -1
      let deletedAt = -1
      for (const event of events) {
        const commitIdx = commits.findIndex((c) =>
          Math.abs(new Date(c.date).getTime() - new Date(event.date).getTime()) < 60000
        )
        if (commitIdx >= 0) {
          if (event.type === 'added' && addedAt < 0) addedAt = commitIdx
          if (event.type === 'deleted') deletedAt = commitIdx
        }
      }
      map.set(filePath, { addedAt, deletedAt })
    }
    for (const node of nodes) {
      if (!map.has(node.id)) map.set(node.id, { addedAt: 0, deletedAt: -1 })
    }
    return map
  }, [fileTimeline, commits, nodes])

  const treeData = useMemo(() => {
    const root: TreeNode = { name: '', path: '', heat: 0, risk: 'low', commitCount: 0, children: [], addedAt: 0, deletedAt: -1 }
    for (const node of nodes) {
      const lc = fileLifecycle.get(node.id)
      if (!lc) continue
      if (currentCommitIndex >= 0 && lc.addedAt > currentCommitIndex) continue
      if (currentCommitIndex >= 0 && lc.deletedAt >= 0 && lc.deletedAt <= currentCommitIndex) continue

      const parts = node.path.split('/')
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]
        const fp = parts.slice(0, i + 1).join('/')
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
      n.children.sort((a, b) => {
        if (!a.fileNode && b.fileNode) return -1
        if (a.fileNode && !b.fileNode) return 1
        return a.name.localeCompare(b.name)
      })
      n.children.forEach(sort)
    }
    sort(root)
    return root
  }, [nodes, fileLifecycle, currentCommitIndex])

  // Detect timeline changes for animation
  useEffect(() => {
    if (prevCommitRef.current !== currentCommitIndex) {
      const now = Date.now()
      for (const [cidx, c] of commits.entries()) {
        if (cidx <= currentCommitIndex && cidx > prevCommitRef.current) {
          for (const f of c.filesChanged || []) {
            const lc = fileLifecycle.get(f)
            const type = lc && lc.addedAt === cidx ? 'added' : lc && lc.deletedAt === cidx ? 'deleted' : 'modified'
            animRef.current.set(f, { type, time: now })
          }
        }
      }
      prevCommitRef.current = currentCommitIndex
    }
  }, [currentCommitIndex, commits, fileLifecycle])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current.clientWidth

    // Defs
    const defs = svg.append('defs')
    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -5 10 10').attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#3b82f6').attr('opacity', 0.4)

    // Glow filter
    const filter = defs.append('filter').attr('id', 'glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 50).scale(1.2))
    zoomRef.current = zoom

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([28, 50]).separation((a, b) => a.parent === b.parent ? 1 : 1.3)(root)

    const allNodes = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const pos = new Map<string, { x: number; y: number; isFile: boolean }>()
    for (const d of allNodes) pos.set(d.data.path, { x: d.x ?? 0, y: d.y ?? 0, isFile: !!d.data.fileNode })

    // Dependency edges
    const edgeData = edges.filter(e => pos.get(e.source) && pos.get(e.target))
    if (edgeData.length > 0) {
      g.append('g').selectAll('path').data(edgeData).join('path')
        .attr('d', d => {
          const s = pos.get(d.source)!, t = pos.get(d.target)!
          return `M${s.x},${s.y}C${(s.x + t.x) / 2},${(s.y + t.y) / 2} ${(s.x + t.x) / 2},${(s.y + t.y) / 2} ${t.x},${t.y}`
        })
        .attr('fill', 'none').attr('stroke', '#3b82f6')
        .attr('stroke-width', d => Math.max(d.weight / 25, 0.4))
        .attr('stroke-opacity', 0.2)
        .attr('marker-end', 'url(#arr)')
        .style('pointer-events', 'none')
    }

    // Tree links
    g.append('g').selectAll('path')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join('path')
      .attr('d', d => d3.linkVertical<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
        .x(n => n.x ?? 0).y(n => n.y ?? 0)(d as unknown as d3.HierarchyPointLink<TreeNode>))
      .attr('fill', 'none').attr('stroke', '#e4e4e7').attr('stroke-width', 0.7)
      .style('pointer-events', 'none')

    // Nodes
    const nodeG = g.append('g').selectAll('g')
      .data(root.descendants() as d3.HierarchyPointNode<TreeNode>[])
      .join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')

    // Directory icons
    nodeG.filter(d => !d.data.fileNode)
      .append('rect')
      .attr('x', -7).attr('y', -5).attr('width', 14).attr('height', 10).attr('rx', 2)
      .attr('fill', d => d.depth <= 2 ? '#a1a1aa' : '#d4d4d8')
      .attr('opacity', 0.6)

    // Directory labels (always visible, top-level and depth-2)
    nodeG.filter(d => !d.data.fileNode && d.depth <= 3)
      .append('text')
      .attr('dy', -8).attr('text-anchor', 'middle')
      .text(d => d.data.name)
      .attr('font-size', d => d.depth <= 1 ? '12px' : '10px')
      .attr('font-weight', d => d.depth <= 1 ? '600' : '500')
      .attr('fill', '#a1a1aa').attr('font-family', 'system-ui')
      .style('pointer-events', 'none')

    // File circles
    nodeG.filter(d => !!d.data.fileNode)
      .append('circle')
      .attr('r', d => Math.max(4, d.data.heat / 7 + 4))
      .attr('fill', d => d.data.risk === 'high' ? '#ef4444' : d.data.risk === 'medium' ? '#eab308' : '#22c55e')
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'none')
      .attr('stroke-width', 2)
      .style('transition', 'r 0.3s ease')

    // File labels (permanent, alternating above/below to avoid overlap)
    nodeG.filter(d => !!d.data.fileNode)
      .append('text')
      .attr('dy', (d, i) => {
        const offset = Math.max(4, d.data.heat / 7 + 4) + 10
        return (i % 2 === 0) ? -offset : offset
      })
      .attr('text-anchor', 'middle')
      .text(d => truncate(d.data.name, 14))
      .attr('font-size', '8px').attr('fill', '#71717a').attr('font-family', 'monospace')
      .attr('opacity', 0.65)
      .style('pointer-events', 'none')

    // Hover: highlight circle + show full name
    nodeG.on('mouseenter', function(_e, d) {
      if (!d.data.fileNode) return
      const sel = d3.select(this)
      sel.select('circle')
        .attr('r', Math.max(4, d.data.heat / 7 + 4) + 2)
        .attr('stroke', '#3b82f6').attr('stroke-width', 2)
      sel.select('text').attr('opacity', 1)
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', e => (e.source === d.data.path || e.target === d.data.path) ? 0.6 : 0.05)
        .attr('stroke-width', e => (e.source === d.data.path || e.target === d.data.path) ? Math.max(e.weight / 12, 1) : Math.max(e.weight / 25, 0.4))
    })

    nodeG.on('mouseleave', function(_e, d) {
      const sel = d3.select(this)
      sel.select('circle')
        .attr('r', Math.max(4, d.data.heat / 7 + 4))
        .attr('stroke', 'none')
      sel.select('text').attr('opacity', d.data.path === selectedNodeId ? 1 : 0.65)
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', 0.2)
        .attr('stroke-width', (e: DependencyEdge) => Math.max((e as DependencyEdge).weight / 25, 0.4))
    })

    nodeG.on('mouseleave', function(_e, d) {
      const sel = d3.select(this)
      sel.select('circle')
        .attr('r', Math.max(4, d.data.heat / 7 + 4))
        .attr('stroke', 'none')
      sel.select('text').attr('opacity', d.data.path === selectedNodeId ? 1 : 0)
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', 0.2)
        .attr('stroke-width', (e: DependencyEdge) => Math.max((e as DependencyEdge).weight / 25, 0.4))
    })

    // Click
    nodeG.on('click', (_e, d) => {
      if (d.data.fileNode) onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
    })

    // Selection highlight
    nodeG.filter(d => d.data.path === selectedNodeId)
      .select('circle')
      .attr('stroke', '#3b82f6').attr('stroke-width', 2.5)
    nodeG.filter(d => d.data.path === selectedNodeId)
      .select('text').attr('opacity', 1).attr('font-weight', '700')

    // Timeline changed file highlights
    for (const f of changedFiles) {
      nodeG.filter(d => d.data.path === f)
        .select('circle')
        .attr('stroke', '#f59e0b').attr('stroke-width', 3)
      nodeG.filter(d => d.data.path === f)
        .select('text').attr('opacity', 1)
    }

    // Animation: nodes that just appeared
    const now = Date.now()
    for (const [fp, anim] of animRef.current) {
      if (now - anim.time > 5000) continue
      nodeG.filter(d => d.data.path === fp && !!d.data.fileNode)
        .select('circle')
        .attr('filter', 'url(#glow)')
        .transition().duration(5000).attr('filter', null)
    }

  }, [treeData, edges, selectedNodeId, changedFiles, nodes.length, fileLifecycle, onNodeSelect])

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
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + '..' : s
}
