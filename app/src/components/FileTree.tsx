'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useMemo, useState } from 'react'
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

const C = { branch: '#e5e5e5', dep: '#c4b5fd', dirFill: '#f3f4f6', dirLabel: '#9ca3af', label: '#6b7280', select: '#8b5cf6', glow: '#f59e0b' }

export default function FileTree({
  nodes, edges, commits, selectedNodeId, onNodeSelect,
  changedFiles, currentCommitIndex, fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const prevPaths = useRef<Set<string>>(new Set())
  const prevBranches = useRef<Set<string>>(new Set())
  const prevIdx = useRef(currentCommitIndex)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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
    // Collapse: hide children of collapsed dirs (only in static view)
    if (currentCommitIndex < 0) {
      const applyCollapse = (n: TreeNode) => {
        if (!n.fileNode && n.children.length > 0 && collapsed.has(n.path)) {
          n.children = []
        }
        for (const c of n.children) applyCollapse(c)
      }
      applyCollapse(root)
    }
    const srt = (n: TreeNode) => { n.children.sort((a, b) => (!a.fileNode && b.fileNode ? -1 : a.fileNode && !b.fileNode ? 1 : a.name.localeCompare(b.name))); n.children.forEach(srt) }
    srt(root); return root
  }, [nodes, fileState, currentCommitIndex, collapsed])

  useEffect(() => {
    const el = svgRef.current
    if (!el || nodes.length === 0) return

    try {
    // ---- RENDER ----
    const svg = d3.select(el)
    const w = el.clientWidth
    const fwd = currentCommitIndex > prevIdx.current
    const prevSet = prevPaths.current
    const prevBrSet = prevBranches.current
    const BRANCH_END = 2000

    // Fade out old content
    const oldG = svg.select<SVGGElement>('g.tree-content')
    if (!oldG.empty()) {
      oldG.transition().duration(250).attr('opacity', 0).remove()
    } else {
      // First time: remove everything except defs
      svg.selectAll('*:not(defs)').remove()
    }

    // Setup defs once
    if (svg.select('defs').empty()) {
      const defs = svg.append('defs')
      defs.append('filter').attr('id', 'sh').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%')
        .append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.5).attr('flood-color', '#000').attr('flood-opacity', 0.04)
      defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -4 8 8').attr('refX', 7).attr('refY', 0)
        .attr('markerWidth', 3).attr('markerHeight', 3).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', C.dep).attr('opacity', 0.5)
    }

    // Zoom
    let g = svg.select<SVGGElement>('g.zoom-layer')
    if (g.empty()) {
      g = svg.append('g').attr('class', 'zoom-layer')
      const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.08, 6]).on('zoom', e => g.attr('transform', e.transform))
      svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(w / 2, 60).scale(1.1))
    }

    // New content group (will fade in)
    const content = g.append('g').attr('class', 'tree-content').attr('opacity', 0)

    const root = d3.hierarchy<TreeNode>(treeData)
    d3.tree<TreeNode>().nodeSize([38, 68]).separation((a, b) => a.parent === b.parent ? 1 : 1.6)(root)

    const desc = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const currentPaths = new Set(desc.map(d => d.data.path))
    const pos = new Map(desc.map(d => [d.data.path, { x: d.x ?? 0, y: d.y ?? 0 }]))

    const links = root.links() as d3.HierarchyPointLink<TreeNode>[]
    const currentBranches = new Set(links.map(l => (l.source as any).data.path + '/' + (l.target as any).data.path))

    // ---- BRANCHES ----
    const brG = content.append('g')
    for (const link of links) {
      const key = (link.source as any).data.path + '/' + (link.target as any).data.path
      const isNewBr = !prevBrSet.has(key)
      brG.append('path')
        .attr('fill', 'none').attr('stroke', C.branch).attr('stroke-width', 1).attr('stroke-linecap', 'round')
        .attr('d', d3.linkVertical<any, any>().x((n: any) => n.x ?? 0).y((n: any) => n.y ?? 0)(link))
        .call(sel => {
          if (fwd && isNewBr) {
            const el = sel.node() as SVGPathElement
            const len = el.getTotalLength()
            if (len > 0) {
              sel.attr('stroke-dasharray', len).attr('stroke-dashoffset', len)
                .transition().duration(BRANCH_END).ease(d3.easeCubicInOut)
                .attr('stroke-dashoffset', 0)
                .transition().duration(200).attr('stroke-dasharray', 'none')
            }
          }
        })
    }

    // ---- DEP EDGES ----
    content.append('g').selectAll('path')
      .data(edges.filter(e => pos.get(e.source) && pos.get(e.target))).join('path')
      .attr('d', d => { const s = pos.get(d.source)!, t = pos.get(d.target)!; return `M${s.x},${s.y}C${(s.x + t.x) / 2},${s.y} ${(s.x + t.x) / 2},${t.y} ${t.x},${t.y}` })
      .attr('fill', 'none').attr('stroke', C.dep).attr('stroke-width', d => Math.max(d.weight / 35, 0.3))
      .attr('stroke-opacity', 0.18).attr('marker-end', 'url(#arr)').style('pointer-events', 'none')

    // ---- NODES ----
    const nodeG = content.append('g').selectAll('g').data(desc).join('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', d => d.data.fileNode ? 'pointer' : 'default')

    // Directory
    nodeG.filter(d => !d.data.fileNode && d.depth >= 1)
      .append('rect').attr('x', -8).attr('y', -5.5).attr('width', 16).attr('height', 11).attr('rx', 2.5)
      .attr('fill', C.dirFill).attr('stroke', C.branch).attr('stroke-width', 0.5).attr('filter', 'url(#sh)')
    nodeG.filter(d => !d.data.fileNode && d.depth >= 1)
      .append('text').attr('dy', -9).attr('text-anchor', 'middle').text(d => d.data.name)
      .attr('font-size', d => d.depth === 1 ? '11px' : '10px').attr('font-weight', d => d.depth === 1 ? '600' : '400')
      .attr('fill', d => d.depth === 1 ? '#4b5563' : C.dirLabel)
      .attr('font-family', 'system-ui, -apple-system, sans-serif').style('pointer-events', 'none')

    // File nodes
    const fileNodes = nodeG.filter(d => !!d.data.fileNode)
    const rad = (d: d3.HierarchyPointNode<TreeNode>) => r(d.data.heat)
    const wasVisible = (d: d3.HierarchyPointNode<TreeNode>) => prevSet.has(d.data.path)

    fileNodes.append('circle')
      .attr('r', d => wasVisible(d) || !fwd ? rad(d) : 3)
      .attr('fill', d => heatFill(d.data.heat)).attr('filter', 'url(#sh)')
      .attr('stroke', 'none').attr('stroke-width', 1.5)

    // Grow only new nodes - start after branch extends
    if (fwd) {
      fileNodes.filter(d => !wasVisible(d)).select('circle')
        .transition().delay(1400).duration(2200).ease(d3.easeElasticOut.amplitude(0.4).period(0.8))
        .attr('r', d => rad(d))
    }

    // Labels
    fileNodes.append('text')
      .attr('dy', (d, i) => (i % 2 === 0 ? -1 : 1) * (rad(d) + 12))
      .attr('text-anchor', 'middle').text(d => truncate(d.data.name, 12))
      .attr('font-size', '8.5px').attr('fill', C.label).attr('font-family', 'ui-monospace, monospace')
      .attr('letter-spacing', '0.01em')
      .attr('opacity', d => wasVisible(d) || !fwd ? 0.5 : 0)

    if (fwd) {
      fileNodes.filter(d => !wasVisible(d)).select('text')
        .transition().delay(2000).duration(600).attr('opacity', 0.5)
    }

    // ---- EFFECTS ----
    fileNodes.filter(d => d.data.isNew).select('circle')
      .attr('stroke', C.glow).attr('stroke-opacity', 0.6)
      .transition().delay(2800).duration(3000).attr('stroke-opacity', 0).attr('stroke', 'none')

    fileNodes.filter(d => d.data.isModified && !d.data.isNew).select('circle')
      .transition().duration(2000).ease(d3.easeSinInOut).attr('r', d => rad(d) * 1.12)
      .transition().duration(2000).ease(d3.easeSinInOut).attr('r', d => rad(d))

    fileNodes.filter(d => changedFiles.includes(d.data.path)).select('circle')
      .attr('stroke', '#f59e0b').attr('stroke-width', 2.5)
      .transition().duration(3000).attr('stroke-opacity', 0).attr('stroke', 'none')

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

    // Directory click: toggle collapse (static view only)
    nodeG.filter(d => !d.data.fileNode && d.depth >= 1).on('click', (_e, d) => {
      if (currentCommitIndex < 0) {
        setCollapsed(prev => {
          const next = new Set(prev)
          if (next.has(d.data.path)) next.delete(d.data.path)
          else next.add(d.data.path)
          return next
        })
      }
    })

    // Collapse/expand indicator on directory nodes (static view)
    if (currentCommitIndex < 0) {
      nodeG.filter(d => !d.data.fileNode && d.depth >= 1)
        .append('text')
        .attr('dy', -1).attr('dx', -13).attr('text-anchor', 'middle')
        .text(d => collapsed.has(d.data.path) ? '+' : '−')
        .attr('font-size', '9px').attr('fill', '#9ca3af').attr('font-weight', '600')
        .style('pointer-events', 'none')
    }

    // Selection
    fileNodes.filter(d => d.data.path === selectedNodeId).select('circle').attr('stroke', C.select).attr('stroke-width', 2.5)
    fileNodes.filter(d => d.data.path === selectedNodeId).select('text').attr('opacity', 0.9).attr('font-weight', '500')

    // Crossfade: fade in new content
    content.transition().duration(300).attr('opacity', 1)

    prevPaths.current = currentPaths
    prevBranches.current = currentBranches
    prevIdx.current = currentCommitIndex

    } catch (err) {
      console.error('FileTree render error:', err)
      // Fallback: clean rebuild
      const svg2 = d3.select(el)
      svg2.selectAll('*').remove()
      svg2.append('text').attr('x', el.clientWidth / 2).attr('y', 100)
        .attr('text-anchor', 'middle').attr('fill', '#9ca3af').attr('font-size', '12px')
        .text('渲染异常，请刷新页面')
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeData, edges, selectedNodeId, nodes.length, onNodeSelect, currentCommitIndex, changedFiles])

  if (nodes.length === 0) return <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">暂无文件数据</div>

  const cnt = countFiles(treeData)

  return (
    <div className="w-full h-full relative bg-[#fafafa]">
      <svg ref={svgRef} className="w-full h-full" />
      {currentCommitIndex >= 0 && (
        <div className="absolute top-4 left-4 text-[11px] text-zinc-400 font-medium tracking-wide select-none">
          {cnt}/{nodes.length} &middot; {currentCommitIndex + 1}/{commits.length}
        </div>
      )}
    </div>
  )
}

function r(heat: number) { return 4 + Math.min(Math.max(heat, 0), 80) * 0.12 }
function heatFill(h: number) { return h > 60 ? '#ef4444' : h > 30 ? '#f59e0b' : '#22c55e' }
function countFiles(n: TreeNode): number { let c = n.fileNode ? 1 : 0; for (const x of n.children) c += countFiles(x); return c }
function truncate(s: string, max: number): string { return s.length > max ? s.slice(0, max - 2) + '..' : s }
