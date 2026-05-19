import simpleGit, { SimpleGit } from 'simple-git'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { CommitSnapshot, AnalyzeRequest } from '@/types/analysis'

export async function cloneOrOpen(
  repoSource: AnalyzeRequest['repoSource']
): Promise<{ git: SimpleGit; repoDir: string; cleanup: () => void }> {
  if (repoSource.type === 'local') {
    const git = simpleGit(repoSource.path)
    const isRepo = await fs.promises
      .access(path.join(repoSource.path, '.git'))
      .then(() => true)
      .catch(() => false)
    if (!isRepo) throw new Error('路径不是有效的 Git 仓库')
    return { git, repoDir: repoSource.path, cleanup: () => {} }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitverse-'))
  // Clone without depth limit to get full history
  await simpleGit().clone(repoSource.url, tmpDir)
  const git = simpleGit(tmpDir)
  return {
    git,
    repoDir: tmpDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  }
}

export interface FileStat {
  path: string
  commitCount: number
  addedLines: number
  deletedLines: number
  lastModified: string
  firstSeen: string
}

export async function getCommits(
  git: SimpleGit,
  maxCommits: number = 500
): Promise<CommitSnapshot[]> {
  const log = await git.log({ maxCount: maxCommits })

  return log.all.map((entry) => {
    // Detect merge commits by checking for multiple parents
    const isMerge = entry.message.includes('Merge') || entry.refs.includes('->')

    return {
      hash: entry.hash,
      date: entry.date,
      message: entry.message.trim(),
      filesChanged: [],
      changeType: isMerge ? ('modified' as const) : ('modified' as const),
    }
  })
}

export async function getFileStats(
  git: SimpleGit,
  maxCommits: number = 500
): Promise<{
  fileStats: Map<string, FileStat>
  fileTimeline: Map<string, Array<{ date: string; type: 'added' | 'modified' | 'deleted' }>>
  commitFiles: Map<string, string[]>
}> {
  const fileStats = new Map<string, FileStat>()
  const fileTimeline = new Map<string, Array<{ date: string; type: 'added' | 'modified' | 'deleted' }>>()
  const commitFiles = new Map<string, string[]>()

  const log = await git.log({ maxCount: maxCommits })

  for (const entry of log.all) {
    let diff: string
    try {
      diff = await git.show(['--name-status', '--format=', '--diff-filter=ACDMR', entry.hash])
    } catch {
      continue
    }

    const changedPaths: string[] = []
    const lines = diff.split('\n').filter(Boolean)
    for (const line of lines) {
      const [status, ...filePathParts] = line.split('\t')
      const filePath = filePathParts.join('\t')
      if (!filePath) continue

      changedPaths.push(filePath)

      let changeType: 'added' | 'modified' | 'deleted' = 'modified'
      if (status.startsWith('A')) changeType = 'added'
      else if (status.startsWith('D')) changeType = 'deleted'
      else if (status.startsWith('R')) changeType = 'added'

      if (!fileTimeline.has(filePath)) {
        fileTimeline.set(filePath, [])
      }
      fileTimeline.get(filePath)!.push({ date: entry.date, type: changeType })

      const existing = fileStats.get(filePath)
      if (!existing) {
        fileStats.set(filePath, {
          path: filePath,
          commitCount: 1,
          addedLines: 0,
          deletedLines: 0,
          lastModified: entry.date,
          firstSeen: entry.date,
        })
      } else {
        existing.commitCount++
        existing.lastModified = entry.date
      }
    }

    commitFiles.set(entry.hash, changedPaths)
  }

  // Get line counts from numstat (bulk operation, faster)
  try {
    const numstat = await git.raw([
      'log',
      `-${maxCommits}`,
      '--numstat',
      '--format=',
      '--diff-filter=ACDMR',
      '--',
      '.',
      ':(exclude)node_modules',
      ':(exclude).git',
      ':(exclude)dist',
      ':(exclude)build',
      ':(exclude).next',
    ])

    const numlines = numstat.split('\n').filter(Boolean)
    for (const line of numlines) {
      const parts = line.split('\t')
      if (parts.length < 3) continue
      const [added, deleted, filePath] = parts
      const addedNum = parseInt(added, 10)
      const deletedNum = parseInt(deleted, 10)
      if (isNaN(addedNum) || isNaN(deletedNum)) continue

      const existing = fileStats.get(filePath)
      if (existing) {
        existing.addedLines += addedNum
        existing.deletedLines += deletedNum
      }
    }
  } catch {
    // line counts are optional, stats work without them
  }

  return { fileStats, fileTimeline, commitFiles }
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage']

export function getSourceFiles(repoDir: string): string[] {
  const results: string[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath)
      }
    }
  }

  walk(repoDir)
  return results
}
