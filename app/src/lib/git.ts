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
    const isRepo = await fs.promises.access(
      path.join(repoSource.path, '.git')
    ).then(() => true).catch(() => false)
    if (!isRepo) throw new Error('路径不是有效的 Git 仓库')
    return { git, repoDir: repoSource.path, cleanup: () => {} }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitverse-'))
  await simpleGit().clone(repoSource.url, tmpDir, ['--depth', '1'])
  const git = simpleGit(tmpDir)
  return {
    git,
    repoDir: tmpDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  }
}

export async function getCommits(
  git: SimpleGit,
  maxCommits: number = 500
): Promise<CommitSnapshot[]> {
  const log = await git.log({ maxCount: maxCommits })

  return await Promise.all(
    log.all.map(async (entry) => {
      const diff = await git.show([
        '--name-status',
        '--format=',
        entry.hash,
      ])

      const filesChanged: { path: string; changeType: CommitSnapshot['changeType'] }[] = []
      const lines = diff.split('\n').filter(Boolean)
      for (const line of lines) {
        const [status, ...rest] = line.split('\t')
        const filePath = rest.join('\t')
        if (!filePath) continue

        let changeType: CommitSnapshot['changeType'] = 'modified'
        if (status.startsWith('A')) changeType = 'added'
        else if (status.startsWith('D')) changeType = 'deleted'

        filesChanged.push({ path: filePath, changeType })
      }

      return {
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        filesChanged: filesChanged.map((f) => f.path),
        changeType: 'modified' as const,
      }
    })
  )
}

export interface FileStat {
  path: string
  commitCount: number
  addedLines: number
  deletedLines: number
}

export async function getFileStats(
  git: SimpleGit,
  maxCommits: number = 500
): Promise<Map<string, FileStat>> {
  const fileStats = new Map<string, FileStat>()

  try {
    const log = await git.raw([
      'log',
      `-${maxCommits}`,
      '--numstat',
      '--format=',
      '--',
      '.',
      ':(exclude)node_modules',
      ':(exclude).git',
      ':(exclude)dist',
      ':(exclude)build',
      ':(exclude).next',
    ])

    const lines = log.split('\n').filter(Boolean)
    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length < 3) continue
      const [added, deleted, filePath] = parts
      const addedNum = parseInt(added, 10) || 0
      const deletedNum = parseInt(deleted, 10) || 0

      const existing = fileStats.get(filePath) || {
        path: filePath,
        commitCount: 0,
        addedLines: 0,
        deletedLines: 0,
      }
      existing.commitCount++
      existing.addedLines += addedNum
      existing.deletedLines += deletedNum
      fileStats.set(filePath, existing)
    }
  } catch {
    try {
      const diffTree = await git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
      const files = diffTree.split('\n').filter(Boolean)
      for (const file of files) {
        const logForFile = await git.log({ file, maxCount: maxCommits })
        fileStats.set(file, {
          path: file,
          commitCount: logForFile.all.length,
          addedLines: 0,
          deletedLines: 0,
        })
      }
    } catch {
      // empty repo, no stats
    }
  }

  return fileStats
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next']

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
