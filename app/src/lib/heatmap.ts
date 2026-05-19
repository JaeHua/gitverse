import { FileNode } from '@/types/analysis'
import path from 'path'
import { FileStat } from './git'

export function calculateFileNodes(
  fileStats: Map<string, FileStat>
): FileNode[] {
  const stats = Array.from(fileStats.values())
  if (stats.length === 0) return []

  const maxCommits = Math.max(...stats.map((s) => s.commitCount), 1)
  const maxChurn = Math.max(...stats.map((s) => s.addedLines + s.deletedLines), 1)

  const nodes: FileNode[] = stats.map((stat) => {
    // Heat combines commit frequency (60%) and churn volume (40%)
    const freqScore = (stat.commitCount / maxCommits) * 60
    const churnScore = ((stat.addedLines + stat.deletedLines) / maxChurn) * 40
    const heat = Math.round(Math.min(freqScore + churnScore, 100))

    let risk: FileNode['risk'] = 'low'
    let riskReason: string | undefined
    const totalChanges = stat.addedLines + stat.deletedLines

    if (stat.commitCount >= 30 || totalChanges > 5000) {
      risk = 'high'
      riskReason = stat.commitCount >= 30
        ? `高频修改: ${stat.commitCount}次`
        : `大变更量: ${totalChanges}行`
    } else if (stat.commitCount >= 15 || totalChanges > 2000) {
      risk = 'medium'
      riskReason = stat.commitCount >= 15
        ? `中频修改: ${stat.commitCount}次`
        : `中变更量: ${totalChanges}行`
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

  // Sort by heat descending
  nodes.sort((a, b) => b.heat - a.heat)

  return nodes
}
