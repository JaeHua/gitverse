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

const COLORS = {
  low: '#34d399',
  medium: '#fbbf24',
  high: '#f87171',
  link: '#c4b5fd',
  branch: '#e5e7eb',
  label: '#9ca3af',
  dirLabel: '#d1d5db',
}

const isPlaying = (idx: number) => idx >= 0

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const prevIndexRef = useRef(currentCommitIndex)

  const fileState = useMemo(() => {
    const state = new Map<string, { exists: boolean; isNew: boolean; isModified: boolean }>()

    if (!isPlaying(currentCommitIndex)) {
      for (const n of nodes) state.set(n.id, { exists: true, isNew: false, isModified: false })
      return state
    }

    const active = new Set<string>()
    for (let i = 0; i <= currentCommitIndex; i++) {
      for (const f of (changedFiles.length > 0 && i === currentCommitIndex ? changedFiles : [])) {
        if (!active.has(f)) { active.add(f); state.set(f, { exists: true, isNew: true, isModified: false }) }
        else state.set(f, { exists: true, isNew: false, isModified: true })
      }
    }

    // Build from commits data
    for (const c of commits.slice(0, currentCommitIndex + 1)) {
      for (const f of c.filesChanged || []) {
        if (!active.has(f)) { active.add(f); state.set(f, { exists: true, isNew: false, isModified: false }) }
      }
    }

    // Fallback: timeline
    for (const [fp, evs] of Object.entries(fileTimeline)) {
      if (state.has(fp)) continue
      for (const ev of evs) {
        const idx = commits.findIndex(c => Math.abs(new Date(c.date).getTime() - new Date(ev.date).getTime()) < 60000)
        if (idx >= 0 && idx <= currentCommitIndex) { active.add(fp); state.set(fp, { exists: true, isNew: idx === currentCommitIndex, isModified: false }); break }
      }
    }

    for (const f of changedFiles) {
      if (state.has(f)) state.get(f)!.isModified = true
    }

    return state
  }, [commits, fileTimeline, currentCommitIndex, changedFiles, nodes])

  const treeData = useMemo(() => {
    const root: TreeNode = { name: '', path: '', heat: 0, risk: 'low', children: [], isNew: false, isModified: false }

    for (const node of nodes) {
      const fs = fileState.get(node.id)
      if (!fs || !fs.exists) continue

      const parts = node.path.split('/')
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i], fp = parts.slice(0, i + 1).join('/')
        let child = cur.children.find(c => c.name === name)
        if (!child) {
          child = { name, path: fp, heat: 0, risk: 'low', children: [], isNew: false, isModified: false }
          cur.children.push(child)
        }
        if (i === parts.length - 1) {
          child.fileNode = node; child.heat = node.heat; child.risk = node.risk
          child.isNew = fs.isNew; child.isModified = fs.isModified
        } else {
          child.heat = Math.max(child.heat, node.heat)
          if (node.risk === 'high') child.risk = 'high'
          else if (node.risk === 'medium' && child.risk !== 'high') child.risk = 'medium'
        }
        cur = child
      }
    }

    if (isPlaying(currentCommitIndex)) {
      const prune = (n: TreeNode): boolean => {
        n.children = n.children.filter(c => prune(c))
        return n.children.length > 0 || !!n.fileNode
      }
      prune(root)
    }

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

    // Drop shadow filter for nodes
    const defs = svg.append('defs')
    const shadow = defs.append('filter').attr('id', 'shadow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    shadow.append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 2).attr('flood-color', '#000').attr('flood-opacity', 0.06)

    const glow = defs.append('filter').attr('id', 'glow')
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'b')
    glow.append('feMerge').selectAll('feMergeNode').data(['b', 'SourceGraphic'] as string[]).join('feMergeNode').attr('in', d => d)

    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -5 10 10').attr('refX', 7).attr('refY', 0)
      .attr('markerWidth', 3).attr('markerHeight', 3).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', COLORS.link).attr('opacity', 0.5)

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 6])
      .on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, 60).scale(1.1))

    const playing = isPlaying(currentCommitIndex)
    const movingFwd = currentCommitIndex > prevIndexRef.current

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([32, 60]).separation((a, b) => (a.parent === b.parent ? 1 : 1.4))(root)

    const desc = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const pos = new Map(desc.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0 }]))

    // ---- BRANCH LINKS (drawn first, extend with animation) ----
    const links = g.append('g').selectAll('path')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join('path')
      .attr('fill', 'none').attr('stroke', COLORS.branch).attr('stroke-width', 1)

    if (playing && movingFwd) {
      links.each(function() {
        const el = this as SVGPathElement
        const len = el.getTotalLength()
        d3.select(el)
          .attr('stroke-dasharray', len)
          .attr('stroke-dashoffset', len)
          .transition().duration(1000).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', '0')
          .transition().duration(300)
          .attr('stroke-dasharray', 'none')
      })
    } else {
      links.attr('d', d => d3.linkVertical<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>().x(n => n.x ?? 0).y(n => n.y ?? 0)(d as any))
    }

    // ---- DEPENDENCY EDGES ----
    const validEdges = edges.filter(e => pos.get(e.source) && pos.get(e.target))
    g.append('g').selectAll('path').data(validEdges).join('path')
      .attr('d', d => { const s = pos.get(d.source)!, t = pos.get(d.target)!; return `M${s.x},${s.y}C${(s.x + t.x) / 2},${s.y} ${(s.x + t.x) / 2},${t.y} ${t.x},${t.y}` })
      .attr('fill', 'none').attr('stroke', COLORS.link).attr('stroke-width', d => Math.max(d.weight / 35, 0.3))
      .attr('stroke-opacity', 0.2).attr('marker-end', 'url(#arr)')
      .style('pointer-events', 'none')

    // ---- NODES ----
    const nodeG = g.append('g').selectAll('g')
      .data(desc)
      .join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')
      .attr('opacity', 0)

    // Fade in nodes
    nodeG.transition().duration(playing && movingFwd ? 600 : 200).delay(playing && movingFwd ? 200 : 0)
      .attr('opacity', 1)

    // ---- DIRECTORY labels (subtle, small) ----
    nodeG.filter(d => !d.data.fileNode && d.depth >= 1 && d.depth <= 2)
      .append('text')
      .attr('dy', -10).attr('text-anchor', 'middle')
      .text(d => d.data.name)
      .attr('font-size', '10px').attr('font-weight', '500')
      .attr('fill', COLORS.dirLabel).attr('font-family', 'system-ui, -apple-system, sans-serif')
      .attr('letter-spacing', '0.02em')
      .style('pointer-events', 'none')

    // ---- FILE NODES with organic growth ----
    const fileNodes = nodeG.filter(d => !!d.data.fileNode)

    // Circle: organic growth from center
    fileNodes.append('circle')
      .attr('r', playing && movingFwd ? 0 : d => nodeRadius(d.data.heat))
      .attr('fill', d => heatColor(d.data.heat))
      .attr('filter', 'url(#shadow)')
      .attr('stroke', 'none')
      .attr('stroke-width', 1.5)

    if (playing && movingFwd) {
      fileNodes.select('circle')
        .transition().duration(900).ease(d3.easeBackOut.overshoot(3))
        .attr('r', d => nodeRadius(d.data.heat))
    }

    // New node organic pulse
    nodeG.filter(d => d.data.isNew && !!d.data.fileNode)
      .select('circle')
      .attr('filter', 'url(#glow)')
      .transition().delay(900).duration(3000).attr('filter', 'url(#shadow)')

    // Modified: subtle breath pulse
    nodeG.filter(d => d.data.isModified && !d.data.isNew && !!d.data.fileNode)
      .select('circle')
      .transition().duration(1800).ease(d3.easeSinInOut)
      .attr('r', d => nodeRadius(d.data.heat) * 1.15)
      .transition().duration(1800).ease(d3.easeSinInOut)
      .attr('r', d => nodeRadius(d.data.heat))

    // ---- FILE LABELS (subtle, low contrast) ----
    fileNodes.append('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (nodeRadius(d.data.heat) + 10))
      .attr('text-anchor', 'middle')
      .text(d => truncate(d.data.name, 14))
      .attr('font-size', '8px').attr('font-weight', '400')
      .attr('fill', COLORS.label).attr('font-family', 'ui-monospace, SF Mono, monospace')
      .attr('letter-spacing', '0.01em')
      .attr('opacity', 0).transition().delay(playing && movingFwd ? 600 : 100).duration(500).attr('opacity', 0.55)

    // ---- INTERACTION ----
    nodeG.on('mouseenter', function(_e, d) {
      if (!d.data.fileNode) return
      d3.select(this).select('circle')
        .transition().duration(200).attr('r', nodeRadius(d.data.heat) + 4)
        .attr('stroke', COLORS.link).attr('stroke-width', 2)
      d3.select(this).select('text').transition().duration(200).attr('opacity', 0.9)
    })
    nodeG.on('mouseleave', function(_e, d) {
      d3.select(this).select('circle')
        .transition().duration(200).attr('r', nodeRadius(d.data.heat))
        .attr('stroke', 'none')
      d3.select(this).select('text').transition().duration(200)
        .attr('opacity', d.data.path === selectedNodeId ? 0.9 : 0.55)
    })
    nodeG.on('click', (_e, d) => {
      if (d.data.fileNode) onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
    })

    // Selected highlight
    nodeG.filter(d => d.data.path === selectedNodeId).select('circle')
      .attr('stroke', '#818cf8').attr('stroke-width', 2.5)
    nodeG.filter(d => d.data.path === selectedNodeId).select('text')
      .attr('opacity', 0.9).attr('font-weight', '500')

    prevIndexRef.current = currentCommitIndex

  }, [treeData, edges, selectedNodeId, nodes.length, onNodeSelect, currentCommitIndex])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  const playing = isPlaying(currentCommitIndex)
  const visibleCount = countFiles(treeData)

  return (
    <div className="w-full h-full relative" style={{ background: 'transparent' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {playing && (
        <div className="absolute top-4 left-4 text-[11px] text-zinc-400 font-medium tracking-wide">
          文件 {visibleCount}/{nodes.length} &middot; {currentCommitIndex + 1}/{commits.length}
        </div>
      )}
    </div>
  )
}

function nodeRadius(heat: number): number {
  return 3 + Math.max(heat, 5) * 0.15
}

function heatColor(heat: number): string {
  if (heat > 60) return '#fca5a5'
  if (heat > 30) return '#fde68a'
  return '#a7f3d0'
}

function countFiles(n: TreeNode): number {
  let c = n.fileNode ? 1 : 0
  for (const ch of n.children) c += countFiles(ch)
  return c
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + '..' : s
}
