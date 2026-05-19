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
  nodes,
  edges,
  commits,
  selectedNodeId,
  onNodeSelect,
  changedFiles,
  currentCommitIndex,
  fileTimeline,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Compute when each file was first added / last deleted (by commit index)
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

    // For files without timeline data, assume they exist from the start
    for (const node of nodes) {
      if (!map.has(node.id)) {
        map.set(node.id, { addedAt: 0, deletedAt: -1 })
      }
    }
    return map
  }, [fileTimeline, commits, nodes])

  // Build directory tree respecting timeline position
  const treeData = useMemo(() => {
    const root: TreeNode = {
      name: '', path: '', heat: 0, risk: 'low', commitCount: 0,
      children: [], addedAt: 0, deletedAt: -1,
    }

    for (const node of nodes) {
      const lifecycle = fileLifecycle.get(node.id)
      if (!lifecycle) continue

      // Skip files that haven't appeared yet at current timeline position
      if (currentCommitIndex >= 0 && lifecycle.addedAt > currentCommitIndex) continue
      // Skip files that have been deleted at current timeline position
      if (currentCommitIndex >= 0 && lifecycle.deletedAt >= 0 && lifecycle.deletedAt <= currentCommitIndex) continue

      const parts = node.path.split('/')
      let current = root

      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1
        const name = parts[i]
        const fullPath = parts.slice(0, i + 1).join('/')

        let child = current.children.find((c) => c.name === name)
        if (!child) {
          child = {
            name, path: fullPath, heat: 0, risk: 'low', commitCount: 0,
            children: [], addedAt: lifecycle.addedAt, deletedAt: lifecycle.deletedAt,
          }
          current.children.push(child)
        }
        if (isLast) {
          child.fileNode = node
          child.heat = node.heat
          child.risk = node.risk
          child.commitCount = node.commitCount
        } else {
          if (node.heat > child.heat) child.heat = node.heat
          if (node.risk === 'high') child.risk = 'high'
          else if (node.risk === 'medium' && child.risk !== 'high') child.risk = 'medium'
          child.commitCount += node.commitCount
        }
        current = child
      }
    }

    // Sort: dirs first, then by name
    function sortTree(n: TreeNode) {
      n.children.sort((a, b) => {
        if (!a.fileNode && b.fileNode) return -1
        if (a.fileNode && !b.fileNode) return 1
        return a.name.localeCompare(b.name)
      })
      for (const c of n.children) sortTree(c)
    }
    sortTree(root)

    return root
  }, [nodes, fileLifecycle, currentCommitIndex])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    // Marker for edges
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow2')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#3b82f6')
      .attr('opacity', 0.4)

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2 - 40, 30))

    const root = d3.hierarchy<TreeNode>(treeData)
    const treeLayout = d3.tree<TreeNode>()
      .nodeSize([26, 60])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2))

    treeLayout(root)

    const allNodes = root.descendants() as d3.HierarchyPointNode<TreeNode>[]
    const nodePositions = new Map<string, { x: number; y: number; isFile: boolean }>()
    for (const d of allNodes) {
      nodePositions.set(d.data.path, { x: d.x ?? 0, y: d.y ?? 0, isFile: !!d.data.fileNode })
    }

    // Draw dependency edges
    const edgeData = edges.filter((e) => {
      const src = nodePositions.get(e.source)
      const tgt = nodePositions.get(e.target)
      return src && tgt
    })

    if (edgeData.length > 0) {
      g.append('g')
        .selectAll('path')
        .data(edgeData)
        .join('path')
        .attr('d', (d) => {
          const src = nodePositions.get(d.source)!
          const tgt = nodePositions.get(d.target)!
          return `M${src.y},${src.x}C${(src.y + tgt.y) / 2},${src.x} ${(src.y + tgt.y) / 2},${tgt.x} ${tgt.y},${tgt.x}`
        })
        .attr('fill', 'none')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', (d) => Math.max(d.weight / 25, 0.4))
        .attr('stroke-opacity', 0.2)
        .attr('marker-end', 'url(#arrow2)')
        .style('pointer-events', 'none')
    }

    // Tree links (vertical)
    g.append('g')
      .selectAll('path')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join('path')
      .attr('d', (d) => {
        return d3.linkVertical<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
          .x((n: d3.HierarchyPointNode<TreeNode>) => n.y ?? 0)
          .y((n: d3.HierarchyPointNode<TreeNode>) => n.x ?? 0)(d as unknown as d3.HierarchyPointLink<TreeNode>)
      })
      .attr('fill', 'none')
      .attr('stroke', '#e4e4e7')
      .attr('stroke-width', 0.8)
      .style('pointer-events', 'none')

    // Node groups
    const nodeGroup = g.append('g')
      .selectAll('g')
      .data(root.descendants() as d3.HierarchyPointNode<TreeNode>[])
      .join('g')
      .attr('transform', (d) => `translate(${d.y ?? 0},${d.x ?? 0})`)
      .attr('cursor', (d) => d.data.fileNode ? 'pointer' : 'default')
      .attr('opacity', (d) => {
        // Gray out files that are being added/deleted at current position
        if (currentCommitIndex < 0) return 1
        const lifecycle = fileLifecycle.get(d.data.path)
        if (!lifecycle) return 1
        if (Math.abs(lifecycle.addedAt - currentCommitIndex) <= 2 && lifecycle.addedAt >= 0) return 0.5
        if (lifecycle.deletedAt >= 0 && Math.abs(lifecycle.deletedAt - currentCommitIndex) <= 2) return 0.5
        return 1
      })

    // File circles
    nodeGroup
      .filter((d) => !!d.data.fileNode)
      .append('circle')
      .attr('r', (d) => Math.max(5, d.data.heat / 5 + 5))
      .attr('fill', (d) => {
        if (d.data.risk === 'high') return '#ef4444'
        if (d.data.risk === 'medium') return '#eab308'
        return '#22c55e'
      })
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'none')
      .attr('stroke-width', 2)

    // New file indicator (ring for recently added)
    nodeGroup
      .filter((d) => {
        if (!d.data.fileNode || currentCommitIndex < 0) return false
        const lc = fileLifecycle.get(d.data.path)
        return !!(lc && lc.addedAt === currentCommitIndex)
      })
      .append('circle')
      .attr('r', (d) => Math.max(5, d.data.heat / 5 + 5) + 3)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,3')

    // Deleted file indicator
    nodeGroup
      .filter((d) => {
        if (!d.data.fileNode || currentCommitIndex < 0) return false
        const lc = fileLifecycle.get(d.data.path)
        return !!(lc && lc.deletedAt >= 0 && lc.deletedAt <= currentCommitIndex + 1)
      })
      .append('line')
      .attr('x1', (d) => -(Math.max(5, d.data.heat / 5 + 5)) * 0.7)
      .attr('y1', (d) => -(Math.max(5, d.data.heat / 5 + 5)) * 0.7)
      .attr('x2', (d) => Math.max(5, d.data.heat / 5 + 5) * 0.7)
      .attr('y2', (d) => Math.max(5, d.data.heat / 5 + 5) * 0.7)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)

    // Directory labels
    nodeGroup
      .filter((d) => !d.data.fileNode)
      .append('text')
      .attr('dy', -6)
      .text((d) => d.data.name)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#a1a1aa')
      .attr('font-family', 'system-ui')
      .style('pointer-events', 'none')

    // File labels
    nodeGroup
      .filter((d) => !!d.data.fileNode)
      .append('text')
      .attr('dy', (d) => -(Math.max(5, d.data.heat / 5 + 5) + 5))
      .text((d) => d.data.name)
      .attr('font-size', '10px')
      .attr('fill', '#71717a')
      .attr('font-family', 'monospace')
      .style('pointer-events', 'none')

    // Click
    nodeGroup.on('click', (_event, d) => {
      if (d.data.fileNode) {
        onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
      }
    })

    // Hover
    nodeGroup.on('mouseenter', (_event, d) => {
      if (!d.data.fileNode) return
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', (e) =>
          (e.source === d.data.path || e.target === d.data.path) ? 0.7 : 0.05
        )
        .attr('stroke-width', (e) =>
          (e.source === d.data.path || e.target === d.data.path)
            ? Math.max(e.weight / 12, 1)
            : Math.max(e.weight / 25, 0.4)
        )
    })

    nodeGroup.on('mouseleave', () => {
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', 0.2)
        .attr('stroke-width', (e: DependencyEdge) => Math.max(e.weight / 25, 0.4))
    })

  }, [treeData, edges, fileLifecycle, currentCommitIndex, nodes.length, selectedNodeId, onNodeSelect])

  // Highlight on selection or timeline change
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll<SVGCircleElement, d3.HierarchyPointNode<TreeNode>>('circle')
      .attr('stroke', (d) => {
        if (changedFiles.includes(d.data.path)) return '#f59e0b'
        if (d.data.path === selectedNodeId) return '#3b82f6'
        return 'none'
      })
      .attr('stroke-width', (d) => {
        if (changedFiles.includes(d.data.path)) return 3
        if (d.data.path === selectedNodeId) return 2.5
        return 2
      })
  }, [changedFiles, selectedNodeId])

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">
        暂无文件数据
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-3 right-3 flex gap-2 text-[10px]">
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">● 低风险</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="text-yellow-500">●</span> 中风险</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="text-red-500">●</span> 高风险</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="text-green-500">---</span> 新增</span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded"><span className="text-red-500">X</span> 删除</span>
      </div>
    </div>
  )
}
