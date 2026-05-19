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
