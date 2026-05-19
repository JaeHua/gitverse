import { FileNode } from '@/types/analysis'
import path from 'path'
import { FileStat } from './git'

export function calculateFileNodes(
  fileStats: Map<string, FileStat>
): FileNode[] {
  const stats = Array.from(fileStats.values())
  if (stats.length === 0) return []

  const maxCommits = Math.max(...stats.map((s) => s.commitCount), 1)

  const nodes: FileNode[] = stats.map((stat) => {
    const heat = Math.round((stat.commitCount / maxCommits) * 100)

    let risk: FileNode['risk'] = 'low'
    let riskReason: string | undefined

    if (stat.commitCount >= 20) {
      risk = 'high'
      riskReason = `高频修改: ${stat.commitCount}次`
    } else if (stat.commitCount >= 10) {
      risk = 'medium'
      riskReason = `中频修改: ${stat.commitCount}次`
    }

    return {
      id: stat.path,
      path: stat.path,
      name: path.basename(stat.path),
      extension: path.extname(stat.path),
      commitCount: stat.commitCount,
      addedLines: stat.addedLines,
      deletedLines: stat.deletedLines,
      heat,
      risk,
      riskReason,
    }
  })

  return nodes
}
