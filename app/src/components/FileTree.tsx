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
  isNew: boolean // just appeared at current commit
  isModified: boolean // changed in current commit
}

const isPlaying = (idx: number) => idx >= 0

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const prevIndexRef = useRef(currentCommitIndex)

  // Determine which files exist at current commit index, and which are new/modified
  const fileState = useMemo(() => {
    const state = new Map<string, { exists: boolean; isNew: boolean; isModified: boolean }>()
    const active = new Set<string>()

    if (!isPlaying(currentCommitIndex)) {
      // Show all files
      for (const n of nodes) state.set(n.id, { exists: true, isNew: false, isModified: false })
      return state
    }

    // Build live set of files up to currentCommitIndex
    for (let i = 0; i <= currentCommitIndex; i++) {
      const files = commits[i].filesChanged || []
      for (const f of files) {
        if (!active.has(f)) {
          active.add(f)
          state.set(f, { exists: true, isNew: i === currentCommitIndex, isModified: i === currentCommitIndex && !state.has(f) })
        } else if (i === currentCommitIndex) {
          state.set(f, { exists: true, isNew: false, isModified: true })
        }
      }
    }

    // Also include files from fileTimeline that might not be in commits.filesChanged
    for (const [fp, events] of Object.entries(fileTimeline)) {
      if (state.has(fp)) continue
      for (const ev of events) {
        const idx = commits.findIndex(c => Math.abs(new Date(c.date).getTime() - new Date(ev.date).getTime()) < 60000)
        if (idx >= 0 && idx <= currentCommitIndex) {
          active.add(fp)
          state.set(fp, { exists: true, isNew: idx === currentCommitIndex, isModified: false })
          break
        }
      }
    }

    // Mark changed files
    for (const f of changedFiles) {
      if (state.has(f)) state.get(f)!.isModified = true
      else {
        active.add(f)
        state.set(f, { exists: true, isNew: false, isModified: true })
      }
    }

    return state
  }, [commits, fileTimeline, currentCommitIndex, changedFiles, nodes])

  // Build tree respecting filtered state. Prune empty dirs when playing.
  const treeData = useMemo(() => {
    const root: TreeNode = { name: '', path: '', heat: 0, risk: 'low', commitCount: 0, children: [], isNew: false, isModified: false }

    for (const node of nodes) {
      const fs = fileState.get(node.id)
      if (!fs || !fs.exists) continue

      const parts = node.path.split('/')
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i], fp = parts.slice(0, i + 1).join('/')
        let child = cur.children.find(c => c.name === name)
        if (!child) {
          child = { name, path: fp, heat: 0, risk: 'low', commitCount: 0, children: [], isNew: false, isModified: false }
          cur.children.push(child)
        }
        if (i === parts.length - 1) {
          child.fileNode = node; child.heat = node.heat; child.risk = node.risk; child.commitCount = node.commitCount
          child.isNew = fs.isNew
          child.isModified = fs.isModified
        } else {
          if (node.heat > child.heat) child.heat = node.heat
          if (node.risk === 'high') child.risk = 'high'
          else if (node.risk === 'medium' && child.risk !== 'high') child.risk = 'medium'
          child.commitCount += node.commitCount
        }
        cur = child
      }
    }

    // Prune empty directories when playing
    function prune(n: TreeNode): boolean {
      n.children = n.children.filter(c => prune(c))
      return n.children.length > 0 || !!n.fileNode
    }
    if (isPlaying(currentCommitIndex)) prune(root)

    const sort = (n: TreeNode) => {
      n.children.sort((a, b) => (!a.fileNode && b.fileNode ? -1 : a.fileNode && !b.fileNode ? 1 : a.name.localeCompare(b.name)))
      n.children.forEach(sort)
    }
    sort(root)
    return root
  }, [nodes, fileState, currentCommitIndex])

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
    filter.append('feMerge').selectAll('feMergeNode').data(['b', 'SourceGraphic'] as string[]).join('feMergeNode').attr('in', d => d)

    const g = svg.append('g')
    gRef.current = g as any

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, 50).scale(1.2))

    const playing = isPlaying(currentCommitIndex)
    const movingForward = currentCommitIndex > prevIndexRef.current

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([30, 55]).separation((a, b) => (a.parent === b.parent ? 1 : 1.3))(root)

    const descendants = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const posMap = new Map(descendants.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0 }]))

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

    // Node groups with enter animation
    const nodeG = g.append('g').selectAll('g')
      .data(descendants)
      .join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')

    // Directory rects
    nodeG.filter(d => !d.data.fileNode)
      .append('rect')
      .attr('x', -7).attr('y', -5).attr('width', 14).attr('height', 10).attr('rx', 2)
      .attr('fill', d => d.depth <= 2 ? '#a1a1aa' : '#d4d4d8').attr('opacity', 0.5)

    // Dir labels
    nodeG.filter(d => !d.data.fileNode && d.depth <= 3)
      .append('text')
      .attr('dy', -9).attr('text-anchor', 'middle').text(d => d.data.name)
      .attr('font-size', d => d.depth <= 1 ? '12px' : '10px')
      .attr('font-weight', d => d.depth <= 1 ? '600' : '500')
      .attr('fill', '#a1a1aa').attr('font-family', 'system-ui')
      .style('pointer-events', 'none')

    // ---- FILE NODES with GROW ANIMATION ----
    const animDuration = playing && movingForward ? 800 : 300
    const labelDelay = playing && movingForward ? 600 : 100

    const circles = nodeG.filter(d => !!d.data.fileNode)
      .append('circle')
      .attr('r', playing && movingForward ? 0 : d => Math.max(4, d.data.heat / 7 + 4))
      .attr('fill', d => d.data.risk === 'high' ? '#ef4444' : d.data.risk === 'medium' ? '#eab308' : '#22c55e')
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'none').attr('stroke-width', 2)

    if (playing && movingForward) {
      circles.transition().duration(animDuration).ease(d3.easeBackOut)
        .attr('r', d => Math.max(4, d.data.heat / 7 + 4))
    }

    // Glow pulse for newly appeared files
    nodeG.filter(d => d.data.isNew && !!d.data.fileNode)
      .select('circle')
      .attr('filter', 'url(#glow)')
      .transition().delay(animDuration).duration(2500).attr('filter', null)

    // Modified files get orange pulse
    nodeG.filter(d => d.data.isModified && !d.data.isNew && !!d.data.fileNode)
      .select('circle')
      .attr('stroke', '#f59e0b').attr('stroke-width', 3)
      .transition().delay(animDuration).duration(2000)
      .attr('stroke-width', 1).attr('stroke', 'none')

    // File labels
    nodeG.filter(d => !!d.data.fileNode)
      .append('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (Math.max(4, d.data.heat / 7 + 4) + 10))
      .attr('text-anchor', 'middle').text(d => truncate(d.data.name, 14))
      .attr('font-size', '8px').attr('fill', '#71717a').attr('font-family', 'monospace')
      .attr('opacity', 0).transition().delay(labelDelay).duration(400).attr('opacity', 0.6)

    // Interaction
    nodeG.on('mouseenter', function(_e, d) {
      if (!d.data.fileNode) return
      d3.select(this).select('circle').transition().duration(150).attr('r', Math.max(4, d.data.heat / 7 + 4) + 3).attr('stroke', '#3b82f6').attr('stroke-width', 2.5)
      d3.select(this).select('text').transition().duration(150).attr('opacity', 1)
    })
    nodeG.on('mouseleave', function(_e, d) {
      d3.select(this).select('circle').transition().duration(150).attr('r', Math.max(4, d.data.heat / 7 + 4)).attr('stroke', 'none')
      d3.select(this).select('text').transition().duration(150).attr('opacity', d.data.path === selectedNodeId ? 1 : 0.6)
    })
    nodeG.on('click', (_e, d) => {
      if (d.data.fileNode) onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
    })

    // Selected highlight
    nodeG.filter(d => d.data.path === selectedNodeId).select('circle').attr('stroke', '#3b82f6').attr('stroke-width', 2.5)
    nodeG.filter(d => d.data.path === selectedNodeId).select('text').attr('opacity', 1).attr('font-weight', '700')

    prevIndexRef.current = currentCommitIndex

  }, [treeData, edges, selectedNodeId, nodes.length, fileState, onNodeSelect, currentCommitIndex])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  const playing = isPlaying(currentCommitIndex)
  const fileCount = treeData.children?.reduce?.((s: number, c: TreeNode) => s + countFiles(c), 0) ?? nodes.length

  return (
    <div className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-3 right-3 flex gap-2 text-[10px]">
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />低</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />中</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />高</span>
      </div>
      {playing && (
        <div className="absolute top-3 left-3 text-xs text-zinc-400 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
          文件 {fileCount}/{nodes.length} · Commit {currentCommitIndex + 1}/{commits.length}
        </div>
      )}
    </div>
  )
}

function countFiles(n: TreeNode): number {
  let c = n.fileNode ? 1 : 0
  for (const ch of n.children) c += countFiles(ch)
  return c
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + '..' : s
}
