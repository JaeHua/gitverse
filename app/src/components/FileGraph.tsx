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

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  heat: number
  risk: string
  name: string
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number
}

const MAX_VISIBLE_NODES = 120

export default function FileGraph({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  changedFiles,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const nodeGroupRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null)
  const linkRef = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null)
  const changedRef = useRef<string[]>([])

  // Keep only top N visible nodes, plus selected node
  const visibleNodes = useMemo(() => {
    if (nodes.length <= MAX_VISIBLE_NODES) return nodes
    const top = nodes.slice(0, MAX_VISIBLE_NODES)
    if (selectedNodeId) {
      const sel = nodes.find((n) => n.id === selectedNodeId)
      if (sel && !top.includes(sel)) {
        top.push(sel)
      }
    }
    return top
  }, [nodes, selectedNodeId])

  // Filter edges to only connections between visible nodes
  const visibleEdges = useMemo(() => {
    const nodeIds = new Set(visibleNodes.map((n) => n.id))
    return edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  }, [edges, visibleNodes])

  useEffect(() => {
    changedRef.current = changedFiles
  }, [changedFiles])

  useEffect(() => {
    if (!svgRef.current || visibleNodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2))

    const simNodes: SimNode[] = visibleNodes.map((n) => ({
      id: n.id,
      heat: n.heat,
      risk: n.risk,
      name: n.name,
    }))

    const simLinks: SimLink[] = visibleEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }))

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => Math.max(30, 120 - d.weight * 0.8))
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide<SimNode>().radius((d) => nodeRadius(d.heat) + 2))

    const link = g
      .append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#d4d4d8')
      .attr('stroke-width', (d) => Math.max(d.weight / 25, 0.3))
      .attr('stroke-opacity', 0.5)

    const nodeGroup = g
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Node circles with size based on heat
    nodeGroup
      .append('circle')
      .attr('r', (d) => nodeRadius(d.heat))
      .attr('fill', (d) => nodeColor(d.risk))
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'none')
      .attr('stroke-width', 2)
      .style('transition', 'stroke 0.2s, stroke-width 0.2s')

    // Labels for larger nodes
    nodeGroup
      .append('text')
      .text((d) => d.name)
      .attr('font-size', '9px')
      .attr('dy', (d) => -(nodeRadius(d.heat) + 4))
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .style('pointer-events', 'none')
      .style('opacity', (d) => (d.heat > 20 ? 1 : 0.4))

    // Click handler
    nodeGroup.on('click', (_event, d) => {
      onNodeSelect(d.id === selectedNodeId ? null : d.id)
    })

    // Hover: highlight connected edges
    nodeGroup.on('mouseenter', (_event, d) => {
      link
        .attr('stroke-opacity', (l) => {
          const sid = typeof l.source === 'object' ? l.source.id : l.source
          const tid = typeof l.target === 'object' ? l.target.id : l.target
          return sid === d.id || tid === d.id ? 1 : 0.05
        })
        .attr('stroke', (l) => {
          const sid = typeof l.source === 'object' ? l.source.id : l.source
          const tid = typeof l.target === 'object' ? l.target.id : l.target
          return sid === d.id || tid === d.id ? '#3b82f6' : '#d4d4d8'
        })
        .attr('stroke-width', (l) => {
          const sid = typeof l.source === 'object' ? l.source.id : l.source
          const tid = typeof l.target === 'object' ? l.target.id : l.target
          return sid === d.id || tid === d.id ? Math.max(l.weight / 12, 1) : Math.max(l.weight / 25, 0.3)
        })
    })

    nodeGroup.on('mouseleave', () => {
      link
        .attr('stroke-opacity', 0.5)
        .attr('stroke', '#d4d4d8')
        .attr('stroke-width', (d) => Math.max(d.weight / 25, 0.3))
    })

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (typeof d.source === 'object' ? d.source.x ?? 0 : 0))
        .attr('y1', (d) => (typeof d.source === 'object' ? d.source.y ?? 0 : 0))
        .attr('x2', (d) => (typeof d.target === 'object' ? d.target.x ?? 0 : 0))
        .attr('y2', (d) => (typeof d.target === 'object' ? d.target.y ?? 0 : 0))

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    simRef.current = simulation
    linkRef.current = link
    nodeGroupRef.current = nodeGroup

    return () => {
      simulation.stop()
    }
  }, [visibleNodes, visibleEdges]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update highlights when selected node or changed files change
  useEffect(() => {
    if (!nodeGroupRef.current) return

    const circles = nodeGroupRef.current.selectAll<SVGCircleElement, SimNode>('circle')
    const changed = changedFiles

    circles
      .attr('stroke', (d) => {
        if (changed.length > 0 && changed.includes(d.id)) return '#f59e0b'
        if (d.id === selectedNodeId) return '#3b82f6'
        return 'none'
      })
      .attr('stroke-width', (d) => {
        if (changed.length > 0 && changed.includes(d.id)) return 3
        if (d.id === selectedNodeId) return 2.5
        return 2
      })
  }, [changedFiles, selectedNodeId])

  if (visibleNodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">
        暂无文件数据
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      {nodes.length > MAX_VISIBLE_NODES && (
        <div className="absolute bottom-3 left-3 text-xs text-zinc-400 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
          显示 {visibleNodes.length}/{nodes.length} 个文件（按热度排序）
        </div>
      )}
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

function nodeRadius(heat: number): number {
  return Math.max(3, 3 + heat * 0.2)
}

function nodeColor(risk: string): string {
  if (risk === 'high') return '#ef4444'
  if (risk === 'medium') return '#eab308'
  return '#22c55e'
}
