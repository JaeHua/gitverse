'use client'

import { useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import { FileNode, DependencyEdge } from '@/types/analysis'

interface Props {
  nodes: FileNode[]
  edges: DependencyEdge[]
  selectedNodeId: string | null
  onNodeSelect: (id: string | null) => void
  changedFiles: string[]
}

interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  isFile: boolean
  heat: number
  risk: string
  commitCount: number
}

export default function FileTree({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  changedFiles,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Build directory tree from flat file list
  const treeData = useMemo(() => {
    const root: TreeNode = { name: '', path: '', children: [], isFile: false, heat: 0, risk: 'low', commitCount: 0 }

    for (const node of nodes) {
      const parts = node.path.split('/')
      let current = root

      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1
        const name = parts[i]
        const fullPath = parts.slice(0, i + 1).join('/')

        let child = current.children.find((c) => c.name === name)
        if (!child) {
          child = {
            name,
            path: fullPath,
            children: [],
            isFile: isLast,
            heat: isLast ? node.heat : 0,
            risk: isLast ? node.risk : 'low',
            commitCount: isLast ? node.commitCount : 0,
          }
          current.children.push(child)
        }
        if (!isLast) {
          // Update directory heat to max of children
          if (node.heat > child.heat) child.heat = node.heat
          if (node.risk === 'high') child.risk = 'high'
          else if (node.risk === 'medium' && child.risk !== 'high') child.risk = 'medium'
          child.commitCount += node.commitCount
        }
        current = child
      }
    }

    // Sort: directories first, then by name
    function sortTree(node: TreeNode) {
      node.children.sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
        return a.name.localeCompare(b.name)
      })
      for (const child of node.children) sortTree(child)
    }
    sortTree(root)

    return root
  }, [nodes])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    // Define arrow marker for dependency edges
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#3b82f6')
      .attr('opacity', 0.5)

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => g.attr('transform', event.transform))

    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(40, height / 2))

    // D3 tree layout
    const root = d3.hierarchy<TreeNode>(treeData)
    const treeLayout = d3.tree<TreeNode>()
      .nodeSize([22, width * 0.02 + 12])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2))

    treeLayout(root)

    // Flatten all nodes with positions
    const allNodes = root.descendants()
    const nodePositions = new Map<string, { x: number; y: number; isFile: boolean }>()
    for (const d of allNodes) {
      nodePositions.set(d.data.path, { x: d.x ?? 0, y: d.y ?? 0, isFile: d.data.isFile })
    }

    // Draw dependency edges (behind nodes)
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
          return curvedPath(src.y, src.x, tgt.y, tgt.x)
        })
        .attr('fill', 'none')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', (d) => Math.max(d.weight / 30, 0.4))
        .attr('stroke-opacity', 0.25)
        .attr('marker-end', 'url(#arrow)')
        .style('pointer-events', 'none')
    }

    // Draw tree links (directory structure)
    g.append('g')
      .selectAll('path')
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join('path')
      .attr('d', (d) => {
        return d3.linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
          .x((n) => n.y)
          .y((n) => n.x)(d)
      })
      .attr('fill', 'none')
      .attr('stroke', '#e4e4e7')
      .attr('stroke-width', 0.8)
      .style('pointer-events', 'none')

    // Draw nodes
    const nodeGroup = g.append('g')
      .selectAll('g')
      .data(root.descendants() as d3.HierarchyPointNode<TreeNode>[])
      .join('g')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .attr('cursor', 'pointer')

    // File nodes: circle sized by heat
    nodeGroup
      .filter((d) => d.data.isFile)
      .append('circle')
      .attr('r', (d) => Math.max(4, d.data.heat / 6 + 4))
      .attr('fill', (d) => {
        if (d.data.risk === 'high') return '#ef4444'
        if (d.data.risk === 'medium') return '#eab308'
        return '#22c55e'
      })
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'none')
      .attr('stroke-width', 2)

    // Directory nodes: small folder icon
    nodeGroup
      .filter((d) => !d.data.isFile)
      .append('rect')
      .attr('x', -5)
      .attr('y', -4)
      .attr('width', 10)
      .attr('height', 8)
      .attr('rx', 1.5)
      .attr('fill', (d) => d.children ? '#a1a1aa' : '#d4d4d8')
      .attr('opacity', 0.7)

    // Labels
    nodeGroup
      .filter((d) => d.data.isFile || d.depth <= 3)
      .append('text')
      .attr('dx', 8)
      .attr('dy', 3)
      .text((d) => d.data.name)
      .attr('font-size', (d) => d.data.isFile ? '10px' : '11px')
      .attr('font-weight', (d) => d.data.isFile ? 'normal' : '600')
      .attr('fill', '#71717a')
      .attr('font-family', 'monospace')
      .style('pointer-events', 'none')

    // Click to select
    nodeGroup.on('click', (_event, d) => {
      if (d.data.isFile) {
        onNodeSelect(d.data.path === selectedNodeId ? null : d.data.path)
      } else {
        // Toggle collapse not implemented for simplicity
        onNodeSelect(null)
      }
    })

    // Highlight on hover
    nodeGroup.on('mouseenter', (_event, d) => {
      if (!d.data.isFile) return
      // Highlight connected edges
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', (e) => {
          return (e.source === d.data.path || e.target === d.data.path) ? 0.7 : 0.1
        })
        .attr('stroke-width', (e) => {
          return (e.source === d.data.path || e.target === d.data.path)
            ? Math.max(e.weight / 15, 1)
            : Math.max(e.weight / 30, 0.4)
        })
    })

    nodeGroup.on('mouseleave', () => {
      svg.selectAll<SVGPathElement, DependencyEdge>('path[marker-end]')
        .attr('stroke-opacity', 0.25)
        .attr('stroke-width', (e: DependencyEdge) => Math.max(e.weight / 30, 0.4))
    })

  }, [treeData, edges, nodes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight nodes when selected or changed in timeline
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    svg.selectAll<SVGCircleElement, d3.HierarchyPointNode<TreeNode>>('circle')
      .attr('stroke', (d) => {
        if (changedFiles.length > 0 && changedFiles.includes(d.data.path)) return '#f59e0b'
        if (d.data.path === selectedNodeId) return '#3b82f6'
        return 'none'
      })
      .attr('stroke-width', (d) => {
        if (changedFiles.length > 0 && changedFiles.includes(d.data.path)) return 3
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
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 低风险
        </span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
          <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> 中风险
        </span>
        <span className="flex items-center gap-1 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 高风险
        </span>
      </div>
    </div>
  )
}

function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const dr = Math.sqrt(dx * dx + dy * dy) * 1.5
  return `M${x1},${y1}A${dr},${dr} 0 0,1 ${x2},${y2}`
}
