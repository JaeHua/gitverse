'use client'

import { useEffect, useRef } from 'react'
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

export default function FileGraph({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  changedFiles,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const linkSelectionRef = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null)
  const nodeGroupRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null)
  const changedRef = useRef(changedFiles)
  changedRef.current = changedFiles

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2))

    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      heat: n.heat,
      risk: n.risk,
      name: n.name,
    }))

    const nodeIdSet = new Set(simNodes.map((n) => n.id))
    const simLinks: SimLink[] = edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((e) => ({
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
          .distance((d) => 100 - d.weight * 0.5)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(0, 0))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => Math.max(d.heat / 4 + 4, 6))
      )

    const link = g
      .append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#d4d4d8')
      .attr('stroke-width', (d) => Math.max(d.weight / 20, 0.5))
      .attr('stroke-opacity', 0.6)

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

    nodeGroup
      .append('circle')
      .attr('r', (d) => Math.max(d.heat / 4 + 4, 6))
      .attr('fill', (d) => {
        if (d.risk === 'high') return '#ef4444'
        if (d.risk === 'medium') return '#eab308'
        return '#22c55e'
      })
      .attr('fill-opacity', 0.8)
      .attr('stroke', 'none')
      .attr('stroke-width', 2)

    nodeGroup
      .append('text')
      .text((d) => d.name)
      .attr('font-size', '10px')
      .attr('dy', (d) => -(Math.max(d.heat / 4 + 4, 6) + 4))
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .style('pointer-events', 'none')

    nodeGroup.on('click', (_event, d) => {
      onNodeSelect(d.id === selectedNodeId ? null : d.id)
    })

    nodeGroup.on('mouseenter', (_event, d) => {
      link
        .attr('stroke-opacity', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source
          const targetId = typeof l.target === 'object' ? l.target.id : l.target
          return sourceId === d.id || targetId === d.id ? 1 : 0.1
        })
        .attr('stroke', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source
          const targetId = typeof l.target === 'object' ? l.target.id : l.target
          return sourceId === d.id || targetId === d.id ? '#3b82f6' : '#d4d4d8'
        })
    })

    nodeGroup.on('mouseleave', () => {
      link.attr('stroke-opacity', 0.6).attr('stroke', '#d4d4d8')
    })

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (typeof d.source === 'object' ? d.source.x || 0 : 0))
        .attr('y1', (d) => (typeof d.source === 'object' ? d.source.y || 0 : 0))
        .attr('x2', (d) => (typeof d.target === 'object' ? d.target.x || 0 : 0))
        .attr('y2', (d) => (typeof d.target === 'object' ? d.target.y || 0 : 0))

      nodeGroup.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`)
    })

    simRef.current = simulation
    linkSelectionRef.current = link
    nodeGroupRef.current = nodeGroup

    return () => {
      simulation.stop()
    }
  }, [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nodeGroupRef.current) return
    const circles = nodeGroupRef.current.selectAll<SVGCircleElement, SimNode>('circle')

    if (changedFiles.length > 0) {
      circles
        .attr('stroke', (d) => {
          if (changedFiles.includes(d.id)) return '#f59e0b'
          if (d.id === selectedNodeId) return '#3b82f6'
          return 'none'
        })
        .attr('stroke-width', (d) => (changedFiles.includes(d.id) ? 3 : 2))
    } else {
      circles
        .attr('stroke', (d) => (d.id === selectedNodeId ? '#3b82f6' : 'none'))
        .attr('stroke-width', 2)
    }
  }, [changedFiles, selectedNodeId])

  return <svg ref={svgRef} className="w-full h-full" />
}
