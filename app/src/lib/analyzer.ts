import { v4 as uuid } from 'uuid'
import path from 'path'
import { GitAnalysis, AnalyzeRequest } from '@/types/analysis'
import { cloneOrOpen, getCommits, getFileStats, getSourceFiles } from './git'
import { analyzeImports } from './deps'
import { calculateFileNodes } from './heatmap'
import { initDB, query } from './db'

export async function analyzeRepo(request: AnalyzeRequest): Promise<string> {
  await initDB()

  const maxCommits = request.maxCommits || 500
  const { git, repoDir, cleanup } = await cloneOrOpen(request.repoSource)
  const repoName =
    request.repoSource.type === 'local'
      ? path.basename(request.repoSource.path)
      : request.repoSource.url.split('/').pop()?.replace('.git', '') || 'unknown'

  try {
    const commits = await getCommits(git, maxCommits)
    const fileStats = await getFileStats(git, maxCommits)

    const sourceFiles = getSourceFiles(repoDir).map((f) => path.relative(repoDir, f))
    const nodes = calculateFileNodes(fileStats, repoDir)

    const nodeIdSet = new Set(nodes.map((n) => n.id))
    const edges = analyzeImports(sourceFiles, repoDir, nodeIdSet)

    const analysisId = uuid()
    const projectId = uuid()
    const now = new Date().toISOString()

    await query(
      `INSERT INTO projects (id, name, source_type, source_path)
       VALUES (?, ?, ?, ?)`,
      [
        projectId,
        repoName,
        request.repoSource.type,
        request.repoSource.type === 'local'
          ? request.repoSource.path
          : request.repoSource.url,
      ]
    )

    await query(
      `INSERT INTO analyses (id, project_id, total_commits, total_files)
       VALUES (?, ?, ?, ?)`,
      [analysisId, projectId, commits.length, nodes.length]
    )

    if (nodes.length > 0) {
      const nodeValues: any[][] = []
      for (const node of nodes) {
        nodeValues.push([
          uuid(),
          analysisId,
          node.path,
          node.name,
          node.extension,
          node.commitCount,
          node.addedLines,
          node.deletedLines,
          node.heat,
          node.risk,
          node.riskReason || null,
        ])
      }
      const placeholders = nodeValues.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',')
      await query(
        `INSERT INTO file_nodes (id, analysis_id, path, name, extension, commit_count, added_lines, deleted_lines, heat, risk, risk_reason)
         VALUES ${placeholders}`,
        nodeValues.flat()
      )
    }

    if (edges.length > 0) {
      const edgeValues: any[][] = []
      for (const edge of edges) {
        edgeValues.push([uuid(), analysisId, edge.source, edge.target, edge.weight, edge.type])
      }
      const placeholders = edgeValues.map(() => '(?,?,?,?,?,?)').join(',')
      await query(
        `INSERT INTO dependency_edges (id, analysis_id, source, target, weight, type)
         VALUES ${placeholders}`,
        edgeValues.flat()
      )
    }

    if (commits.length > 0) {
      const commitValues: any[][] = []
      for (const commit of commits) {
        commitValues.push([
          uuid(),
          analysisId,
          commit.hash,
          commit.date,
          commit.message,
          JSON.stringify(commit.filesChanged),
        ])
      }
      const placeholders = commitValues.map(() => '(?,?,?,?,?,?)').join(',')
      await query(
        `INSERT INTO commit_snapshots (id, analysis_id, hash, date, message, files_changed)
         VALUES ${placeholders}`,
        commitValues.flat()
      )
    }

    return analysisId
  } finally {
    cleanup()
  }
}

export async function getAnalysis(analysisId: string): Promise<GitAnalysis | null> {
  const analyses = await query<any>(
    `SELECT a.*, p.id as proj_id, p.name as repo_name, p.source_type, p.source_path
     FROM analyses a
     JOIN projects p ON p.id = a.project_id
     WHERE a.id = ?`,
    [analysisId]
  )
  if (analyses.length === 0) return null

  const a = analyses[0]
  const nodes = await query<any>(
    'SELECT * FROM file_nodes WHERE analysis_id = ?',
    [analysisId]
  )
  const edges = await query<any>(
    'SELECT * FROM dependency_edges WHERE analysis_id = ?',
    [analysisId]
  )
  const commits = await query<any>(
    'SELECT * FROM commit_snapshots WHERE analysis_id = ? ORDER BY date ASC',
    [analysisId]
  )

  return {
    projectId: a.proj_id,
    repoName: a.repo_name,
    totalCommits: a.total_commits,
    totalFiles: a.total_files,
    analyzedAt: a.analyzed_at instanceof Date ? a.analyzed_at.toISOString() : String(a.analyzed_at),
    nodes: nodes.map((n: any) => ({
      id: n.path,
      path: n.path,
      name: n.name,
      extension: n.extension,
      commitCount: n.commit_count,
      addedLines: n.added_lines,
      deletedLines: n.deleted_lines,
      heat: Number(n.heat),
      risk: n.risk,
      riskReason: n.risk_reason,
    })),
    edges: edges.map((e: any) => ({
      source: e.source,
      target: e.target,
      weight: Number(e.weight),
      type: e.type,
    })),
    commits: commits.map((c: any) => ({
      hash: c.hash,
      date: c.date instanceof Date ? c.date.toISOString() : String(c.date),
      message: c.message,
      filesChanged: typeof c.files_changed === 'string'
        ? JSON.parse(c.files_changed)
        : c.files_changed || [],
      changeType: 'modified' as const,
    })),
  }
}

export async function getProjects() {
  const rows = await query<any>(
    `SELECT p.*,
       MAX(a.analyzed_at) as last_analyzed_at,
       MAX(a.total_files) as file_count,
       MAX(a.total_commits) as commit_count,
       (SELECT COUNT(*) FROM file_nodes fn
        JOIN analyses a2 ON a2.id = fn.analysis_id
        WHERE a2.project_id = p.id
        AND fn.risk = 'high'
        AND a2.id = (SELECT a3.id FROM analyses a3 WHERE a3.project_id = p.id ORDER BY a3.analyzed_at DESC LIMIT 1)
       ) as high_risk_count
     FROM projects p
     LEFT JOIN analyses a ON a.project_id = p.id
     GROUP BY p.id
     ORDER BY last_analyzed_at DESC`
  )

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    sourceType: r.source_type,
    sourceInfo: r.source_path,
    lastAnalyzedAt: r.last_analyzed_at
      ? (r.last_analyzed_at instanceof Date ? r.last_analyzed_at.toISOString() : String(r.last_analyzed_at))
      : r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    fileCount: r.file_count || 0,
    commitCount: r.commit_count || 0,
    highRiskCount: r.high_risk_count || 0,
  }))
}

export async function deleteProject(projectId: string) {
  await query('DELETE FROM projects WHERE id = ?', [projectId])
}
