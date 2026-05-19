import { v4 as uuid } from 'uuid'
import path from 'path'
import { GitAnalysis, AnalyzeRequest, FileNode, DependencyEdge } from '@/types/analysis'
import { cloneOrOpen, getCommits, getFileStats, getSourceFiles } from './git'
import { analyzeImports } from './deps'
import { calculateFileNodes } from './heatmap'
import { initDB, query } from './db'

interface DbRow {
  [key: string]: unknown
}

export async function analyzeRepo(
  request: AnalyzeRequest,
  userId: string
): Promise<string> {
  await initDB()

  const maxCommits = request.maxCommits || 500
  const { git, repoDir, cleanup } = await cloneOrOpen(request.repoSource)
  const repoName =
    request.repoSource.type === 'local'
      ? path.basename(request.repoSource.path)
      : request.repoSource.url.split('/').pop()?.replace('.git', '') || 'unknown'

  try {
    const commits = await getCommits(git, maxCommits)
    const { fileStats, fileTimeline, commitFiles } = await getFileStats(git, maxCommits)

    // Populate filesChanged from commitFiles data
    for (const commit of commits) {
      commit.filesChanged = commitFiles.get(commit.hash) || []
    }

    const sourceFiles = getSourceFiles(repoDir).map((f) => path.relative(repoDir, f))
    const nodes = calculateFileNodes(fileStats)

    const nodeIdSet = new Set(nodes.map((n) => n.id))
    const edges = analyzeImports(sourceFiles, repoDir, nodeIdSet)

    const analysisId = uuid()
    const projectId = uuid()

    // Convert Map to plain object for JSON storage
    const fileTimelineObj: Record<string, Array<{ date: string; type: string }>> = {}
    for (const [filePath, events] of fileTimeline) {
      fileTimelineObj[filePath] = events
    }

    await query(
      `INSERT INTO projects (id, user_id, name, source_type, source_path)
       VALUES (?, ?, ?, ?, ?)`,
      [
        projectId,
        userId,
        repoName,
        request.repoSource.type,
        request.repoSource.type === 'local'
          ? request.repoSource.path
          : request.repoSource.url,
      ]
    )

    await query(
      `INSERT INTO analyses (id, project_id, total_commits, total_files, file_timeline)
       VALUES (?, ?, ?, ?, ?)`,
      [analysisId, projectId, commits.length, nodes.length, JSON.stringify(fileTimelineObj)]
    )

    if (nodes.length > 0) {
      const nodeValues: unknown[][] = []
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
      const edgeValues: unknown[][] = []
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
      const commitValues: unknown[][] = []
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
  const analyses = await query<DbRow>(
    `SELECT a.*, p.id as proj_id, p.name as repo_name, p.source_type, p.source_path
     FROM analyses a
     JOIN projects p ON p.id = a.project_id
     WHERE a.id = ?`,
    [analysisId]
  )
  if (analyses.length === 0) return null

  const a = analyses[0]
  const nodes = await query<DbRow>(
    'SELECT * FROM file_nodes WHERE analysis_id = ?',
    [analysisId]
  )
  const edges = await query<DbRow>(
    'SELECT * FROM dependency_edges WHERE analysis_id = ?',
    [analysisId]
  )
  const commits = await query<DbRow>(
    'SELECT * FROM commit_snapshots WHERE analysis_id = ? ORDER BY date ASC',
    [analysisId]
  )

  let fileTimeline: Record<string, Array<{ date: string; type: string }>> = {}
  try {
    if (typeof a.file_timeline === 'string') {
      fileTimeline = JSON.parse(a.file_timeline)
    } else if (a.file_timeline) {
      fileTimeline = a.file_timeline as unknown as Record<string, Array<{ date: string; type: string }>>
    }
  } catch {
    // ignore timeline parse errors
  }

  return {
    projectId: a.proj_id as string,
    repoName: a.repo_name as string,
    totalCommits: a.total_commits as number,
    totalFiles: a.total_files as number,
    analyzedAt: a.analyzed_at instanceof Date ? a.analyzed_at.toISOString() : String(a.analyzed_at),
    projectReadme: (a.project_readme as string) || '',
    fileTimeline: fileTimeline as GitAnalysis['fileTimeline'],
    nodes: nodes.map((n: DbRow) => ({
      id: n.path as string,
      path: n.path as string,
      name: n.name as string,
      extension: n.extension as string,
      commitCount: n.commit_count as number,
      addedLines: n.added_lines as number,
      deletedLines: n.deleted_lines as number,
      heat: Number(n.heat),
      risk: n.risk as FileNode['risk'],
      riskReason: n.risk_reason as string | undefined,
    })),
    edges: edges.map((e: DbRow) => ({
      source: e.source as string,
      target: e.target as string,
      weight: Number(e.weight),
      type: e.type as DependencyEdge['type'],
    })),
    commits: commits.map((c: DbRow) => ({
      hash: c.hash as string,
      date: c.date instanceof Date ? c.date.toISOString() : String(c.date),
      message: c.message as string,
      filesChanged: typeof c.files_changed === 'string'
        ? JSON.parse(c.files_changed)
        : (c.files_changed as string[]) || [],
      changeType: 'modified' as const,
    })),
  }
}

export async function getProjects(userId: string) {
  const rows = await query<DbRow>(
    `SELECT p.*,
       MAX(a.analyzed_at) as last_analyzed_at,
       MAX(a.total_files) as file_count,
       MAX(a.total_commits) as commit_count,
       (SELECT a3.id FROM analyses a3 WHERE a3.project_id = p.id ORDER BY a3.analyzed_at DESC LIMIT 1) as latest_analysis_id,
       (SELECT COUNT(*) FROM file_nodes fn
        JOIN analyses a2 ON a2.id = fn.analysis_id
        WHERE a2.project_id = p.id
        AND fn.risk = 'high'
        AND a2.id = (SELECT a3.id FROM analyses a3 WHERE a3.project_id = p.id ORDER BY a3.analyzed_at DESC LIMIT 1)
       ) as high_risk_count
      FROM projects p
      LEFT JOIN analyses a ON a.project_id = p.id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY last_analyzed_at DESC`,
    [userId]
  )

  return rows.map((r: DbRow) => ({
    id: r.id as string,
    name: r.name as string,
    sourceType: r.source_type as 'local' | 'remote',
    sourceInfo: r.source_path as string,
    lastAnalyzedAt: r.last_analyzed_at
      ? (r.last_analyzed_at instanceof Date ? r.last_analyzed_at.toISOString() : String(r.last_analyzed_at))
      : r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    latestAnalysisId: r.latest_analysis_id as string,
    fileCount: (r.file_count as number) || 0,
    commitCount: (r.commit_count as number) || 0,
    highRiskCount: (r.high_risk_count as number) || 0,
  }))
}

export async function deleteProject(projectId: string, userId: string) {
  await query('DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId])
}

export async function saveProjectReadme(analysisId: string, content: string) {
  await query('UPDATE analyses SET project_readme = ? WHERE id = ?', [content, analysisId])
}
