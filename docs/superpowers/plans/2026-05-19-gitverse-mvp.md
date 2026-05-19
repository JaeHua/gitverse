# Gitverse MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Gitverse MVP — 可视化代码演进与依赖分析工具，支持本地/远程 Git 仓库分析，力导向图展示文件依赖，时间轴播放历史演进，风险热点识别，多项目管理。

**Architecture:** 服务端分析 + MySQL 持久化 + 客户端 D3 渲染。Next.js API Routes 通过 simple-git 解析仓库，TypeScript Compiler API 分析 import 依赖，结果写入 MySQL，客户端通过 API 获取 JSON 后用 D3.js 渲染力导向图和时间轴。

**Tech Stack:** Next.js 16, React 19, TailwindCSS 4, TypeScript, D3.js, simple-git, mysql2

---

### Task 1: 项目初始化与依赖安装

**Files:**
- Modify: `app/package.json`
- Create: `app/.env.local`

- [ ] **Step 1: 创建 develop 分支**

```bash
git checkout -b develop
```

Expected: 切换到 develop 分支

- [ ] **Step 2: 安装 npm 依赖**

Run:
```bash
npm install simple-git mysql2 uuid d3 @types/d3
```
workdir: `app/`

Expected: 安装成功

- [ ] **Step 3: 创建环境变量文件**

Write `app/.env.local`:
```
DATABASE_URL=mysql://root:password@localhost:3306/gitverse
```

- [ ] **Step 4: 验证项目可启动**

Run:
```bash
npm run dev
```
workdir: `app/`

Expected: Next.js 启动在 localhost:3000

- [ ] **Step 5: 提交**

```bash
git add app/package.json app/package-lock.json app/.env.local
git commit -m "chore: add dependencies (simple-git, mysql2, uuid, d3)"
```

---

### Task 2: TypeScript 类型定义

**Files:**
- Create: `app/src/types/analysis.ts`

- [ ] **Step 1: 创建类型文件**

Write `app/src/types/analysis.ts`:
```typescript
export interface GitAnalysis {
  projectId: string
  repoName: string
  totalCommits: number
  totalFiles: number
  analyzedAt: string
  nodes: FileNode[]
  edges: DependencyEdge[]
  commits: CommitSnapshot[]
}

export interface FileNode {
  id: string
  path: string
  name: string
  extension: string
  commitCount: number
  addedLines: number
  deletedLines: number
  heat: number
  risk: 'high' | 'medium' | 'low'
  riskReason?: string
}

export interface DependencyEdge {
  source: string
  target: string
  weight: number
  type: 'direct'
}

export interface CommitSnapshot {
  hash: string
  date: string
  message: string
  filesChanged: string[]
  changeType: 'added' | 'modified' | 'deleted'
}

export interface RepoSource =
  | { type: 'local'; path: string }
  | { type: 'remote'; url: string }

export interface AnalyzeRequest {
  repoSource: RepoSource
  excludePatterns?: string[]
  maxCommits?: number
}

export interface ProjectSummary {
  id: string
  name: string
  sourceType: 'local' | 'remote'
  sourceInfo: string
  lastAnalyzedAt: string
  fileCount: number
  commitCount: number
  highRiskCount: number
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/types/analysis.ts
git commit -m "feat: define TypeScript types for GitAnalysis data model"
```

---

### Task 3: 数据库模块

**Files:**
- Create: `app/src/lib/db/schema.ts`
- Create: `app/src/lib/db/index.ts`

- [ ] **Step 1: 创建 DDL schema**

Write `app/src/lib/db/schema.ts`:
```typescript
export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source_type ENUM('local', 'remote') NOT NULL,
  source_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS analyses (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  total_commits INT NOT NULL DEFAULT 0,
  total_files INT NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS file_nodes (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  path TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  extension VARCHAR(20),
  commit_count INT DEFAULT 0,
  added_lines INT DEFAULT 0,
  deleted_lines INT DEFAULT 0,
  heat DECIMAL(5,2) DEFAULT 0,
  risk ENUM('high', 'medium', 'low') DEFAULT 'low',
  risk_reason TEXT,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dependency_edges (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  weight DECIMAL(5,2) DEFAULT 0,
  type VARCHAR(20) DEFAULT 'direct',
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commit_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  hash VARCHAR(40) NOT NULL,
  date DATETIME NOT NULL,
  message TEXT,
  files_changed JSON,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`
```

- [ ] **Step 2: 创建数据库连接模块**

Write `app/src/lib/db/index.ts`:
```typescript
import mysql from 'mysql2/promise'
import { CREATE_TABLES } from './schema'

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/gitverse',
  waitForConnections: true,
  connectionLimit: 5,
})

export async function initDB() {
  const statements = CREATE_TABLES.split(';').filter(s => s.trim())
  for (const stmt of statements) {
    await pool.execute(stmt + ';')
  }
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

export default pool
```

- [ ] **Step 3: 提交**

```bash
git add app/src/lib/db/
git commit -m "feat: add database module with MySQL schema and connection"
```

---

### Task 4: Git 仓库解析模块

**Files:**
- Create: `app/src/lib/git.ts`

- [ ] **Step 1: 创建 git 解析模块**

Write `app/src/lib/git.ts`:
```typescript
import simpleGit, { SimpleGit, LogResult } from 'simple-git'
import { v4 as uuid } from 'uuid'
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

  // Remote: clone to temp directory
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
  const log: LogResult = await git.log({ maxCount: maxCommits })

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
        changeType: 'modified',
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
    // Fallback: use diff-tree
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
  }

  return fileStats
}

export function getSourceFiles(
  repoDir: string
): string[] {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next']

  const results: string[] = []

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (excludeDirs.includes(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath)
      }
    }
  }

  walk(repoDir)
  return results
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/lib/git.ts
git commit -m "feat: add Git repository parsing module (clone, log, file stats)"
```

---

### Task 5: 依赖分析模块

**Files:**
- Create: `app/src/lib/deps.ts`

- [ ] **Step 1: 创建 import 依赖解析模块**

Write `app/src/lib/deps.ts`:
```typescript
import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { DependencyEdge } from '@/types/analysis'

function resolveImportPath(
  importPath: string,
  currentFile: string,
  repoDir: string
): string | null {
  // Skip external packages (non-relative imports without extension-like patterns)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null
  }

  const baseDir = path.dirname(currentFile)
  const resolved = path.resolve(baseDir, importPath)

  // Try exact path
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return path.relative(repoDir, resolved)
  }

  // Try with extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']
  for (const ext of extensions) {
    const withExt = resolved + ext
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return path.relative(repoDir, withExt)
    }
  }

  return null
}

function parseImportsInFile(
  filePath: string,
  repoDir: string
): Array<{ source: string; target: string }> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  )

  const relativePath = path.relative(repoDir, filePath)
  const imports: Array<{ source: string; target: string }> = []

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const importPath = node.moduleSpecifier.text
      const resolved = resolveImportPath(importPath, filePath, repoDir)
      if (resolved) {
        imports.push({ source: relativePath, target: resolved })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return imports
}

export function analyzeImports(
  sourceFiles: string[],
  repoDir: string,
  existingNodes: Set<string>
): DependencyEdge[] {
  const importMap = new Map<string, Map<string, number>>()

  for (const filePath of sourceFiles) {
    const absPath = path.resolve(repoDir, filePath)
    if (!fs.existsSync(absPath)) continue

    try {
      const imports = parseImportsInFile(absPath, repoDir)
      for (const { source, target } of imports) {
        // Only include edges where both source and target are in our node set
        if (!existingNodes.has(source) || !existingNodes.has(target)) continue
        if (source === target) continue

        if (!importMap.has(source)) {
          importMap.set(source, new Map())
        }
        const targetMap = importMap.get(source)!
        targetMap.set(target, (targetMap.get(target) || 0) + 1)
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  // Calculate co-commit frequency from commit data (simplified: use callCount)
  const edges: DependencyEdge[] = []
  for (const [source, targets] of importMap) {
    for (const [target, callCount] of targets) {
      const weight = Math.min(
        100,
        Math.log2(callCount + 1) * 20 + Math.min(60, callCount * 5)
      )
      edges.push({
        source,
        target,
        weight: Math.round(weight * 100) / 100,
        type: 'direct',
      })
    }
  }

  return edges
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/lib/deps.ts
git commit -m "feat: add import dependency analysis module (TypeScript Compiler API)"
```

---

### Task 6: 热度与风险计算模块

**Files:**
- Create: `app/src/lib/heatmap.ts`

- [ ] **Step 1: 创建热度计算模块**

Write `app/src/lib/heatmap.ts`:
```typescript
import { FileNode } from '@/types/analysis'
import { v4 as uuid } from 'uuid'
import path from 'path'
import { FileStat } from './git'

export function calculateFileNodes(
  fileStats: Map<string, FileStat>,
  repoDir: string
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
```

- [ ] **Step 2: 提交**

```bash
git add app/src/lib/heatmap.ts
git commit -m "feat: add heat map and risk calculation module"
```

---

### Task 7: 分析主流程编排

**Files:**
- Create: `app/src/lib/analyzer.ts`

- [ ] **Step 1: 创建分析编排模块**

Write `app/src/lib/analyzer.ts`:
```typescript
import { v4 as uuid } from 'uuid'
import { SimpleGit } from 'simple-git'
import path from 'path'
import { GitAnalysis, AnalyzeRequest } from '@/types/analysis'
import { cloneOrOpen, getCommits, getFileStats, getSourceFiles } from './git'
import { analyzeImports } from './deps'
import { calculateFileNodes } from './heatmap'
import pool, { initDB, query } from './db'

export async function analyzeRepo(
  request: AnalyzeRequest
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
    const fileStats = await getFileStats(git, maxCommits)

    const sourceFiles = getSourceFiles(repoDir).map((f) => path.relative(repoDir, f))
    const nodes = calculateFileNodes(fileStats, repoDir)

    const nodeIdSet = new Set(nodes.map((n) => n.id))
    const edges = analyzeImports(sourceFiles, repoDir, nodeIdSet)

    const analysisId = uuid()
    const projectId = uuid()
    const now = new Date().toISOString()

    const analysis: GitAnalysis = {
      projectId,
      repoName,
      totalCommits: commits.length,
      totalFiles: nodes.length,
      analyzedAt: now,
      nodes,
      edges,
      commits,
    }

    // Upsert project
    await query(
      `INSERT INTO projects (id, name, source_type, source_path)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [
        projectId,
        repoName,
        request.repoSource.type,
        request.repoSource.type === 'local'
          ? request.repoSource.path
          : request.repoSource.url,
      ]
    )

    // Insert analysis
    await query(
      `INSERT INTO analyses (id, project_id, total_commits, total_files)
       VALUES (?, ?, ?, ?)`,
      [analysisId, projectId, commits.length, nodes.length]
    )

    // Insert file nodes in batches
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
    if (nodeValues.length > 0) {
      const placeholders = nodeValues.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',')
      await query(
        `INSERT INTO file_nodes (id, analysis_id, path, name, extension, commit_count, added_lines, deleted_lines, heat, risk, risk_reason)
         VALUES ${placeholders}`,
        nodeValues.flat()
      )
    }

    // Insert edges
    const edgeValues: any[][] = []
    for (const edge of edges) {
      edgeValues.push([uuid(), analysisId, edge.source, edge.target, edge.weight, edge.type])
    }
    if (edgeValues.length > 0) {
      const placeholders = edgeValues.map(() => '(?,?,?,?,?,?)').join(',')
      await query(
        `INSERT INTO dependency_edges (id, analysis_id, source, target, weight, type)
         VALUES ${placeholders}`,
        edgeValues.flat()
      )
    }

    // Insert commit snapshots
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
    if (commitValues.length > 0) {
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
    `SELECT a.*, p.id as project_id, p.name as repo_name, p.source_type, p.source_path
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
    projectId: a.project_id,
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
```

- [ ] **Step 2: 提交**

```bash
git add app/src/lib/analyzer.ts
git commit -m "feat: add analysis orchestrator with MySQL persistence"
```

---

### Task 8: API - POST /api/analyze

**Files:**
- Create: `app/src/app/api/analyze/route.ts`

- [ ] **Step 1: 创建分析接口**

Write `app/src/app/api/analyze/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { analyzeRepo } from '@/lib/analyzer'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.repoSource) {
      return NextResponse.json({ error: '缺少 repoSource 参数' }, { status: 400 })
    }

    const { repoSource, excludePatterns, maxCommits } = body

    if (repoSource.type === 'local' && !repoSource.path) {
      return NextResponse.json({ error: '本地路径不能为空' }, { status: 400 })
    }
    if (repoSource.type === 'remote' && !repoSource.url) {
      return NextResponse.json({ error: '远程仓库 URL 不能为空' }, { status: 400 })
    }

    const analysisId = await analyzeRepo({
      repoSource,
      excludePatterns: excludePatterns || ['node_modules', '.git', 'dist', 'build', '.next'],
      maxCommits: maxCommits || 500,
    })

    return NextResponse.json({ analysisId })
  } catch (error: any) {
    console.error('Analyze error:', error)
    return NextResponse.json(
      { error: error.message || '分析失败' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/app/api/analyze/route.ts
git commit -m "feat: add POST /api/analyze endpoint"
```

---

### Task 9: API - GET /api/analysis/[id]

**Files:**
- Create: `app/src/app/api/analysis/[id]/route.ts`

- [ ] **Step 1: 创建分析查询接口**

Create directory: `app/src/app/api/analysis/[id]`

Write `app/src/app/api/analysis/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAnalysis } from '@/lib/analyzer'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const analysis = await getAnalysis(id)

    if (!analysis) {
      return NextResponse.json({ error: '分析结果不存在' }, { status: 404 })
    }

    return NextResponse.json(analysis)
  } catch (error: any) {
    console.error('Get analysis error:', error)
    return NextResponse.json(
      { error: error.message || '获取分析结果失败' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/app/api/analysis/
git commit -m "feat: add GET /api/analysis/[id] endpoint"
```

---

### Task 10: API - GET/DELETE /api/projects

**Files:**
- Create: `app/src/app/api/projects/route.ts`

- [ ] **Step 1: 创建项目管理接口**

Write `app/src/app/api/projects/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getProjects, deleteProject } from '@/lib/analyzer'

export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json({ projects })
  } catch (error: any) {
    console.error('Get projects error:', error)
    return NextResponse.json(
      { error: error.message || '获取项目列表失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 })
    }
    await deleteProject(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: error.message || '删除项目失败' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/app/api/projects/route.ts
git commit -m "feat: add GET/DELETE /api/projects endpoints"
```

---

### Task 11: 首页 - 项目管理页

**Files:**
- Modify: `app/src/app/layout.tsx`
- Modify: `app/src/app/page.tsx`

- [ ] **Step 1: 更新 Layout metadata**

Edit `app/src/app/layout.tsx`, replace the `metadata` export:
```typescript
export const metadata: Metadata = {
  title: 'Gitverse - 可视化代码演进分析',
  description: '可视化代码演进与依赖分析工具',
}
```

- [ ] **Step 2: 重写首页**

Write `app/src/app/page.tsx`:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { ProjectSummary } from '@/types/analysis'

export default function HomePage() {
  const [repoSource, setRepoSource] = useState('')
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (data.projects) setProjects(data.projects)
    } catch {
      // ignore
    }
  }

  async function handleAnalyze() {
    if (!repoSource.trim()) {
      setError('请输入仓库路径或 URL')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoSource:
            sourceType === 'local'
              ? { type: 'local', path: repoSource }
              : { type: 'remote', url: repoSource },
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else if (data.analysisId) {
        setMessage(`分析完成! 跳转中...`)
        setRepoSource('')
        await loadProjects()
        // Navigate to analysis page
        window.location.href = `/analyze/${data.analysisId}`
      }
    } catch (e) {
      setError('请求失败，请检查网络或仓库地址')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(projectId: string) {
    try {
      await fetch(`/api/projects?id=${projectId}`, { method: 'DELETE' })
      loadProjects()
    } catch {
      // ignore
    }
  }

  function riskColor(riskCount: number) {
    if (riskCount >= 10) return 'text-red-500'
    if (riskCount >= 5) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-blue-500">Git</span>verse
          </h1>
          <span className="text-xs text-zinc-400">可视化代码演进分析</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Input Section */}
        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">分析新仓库</h2>
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => setSourceType('local')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'local'
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              本地路径
            </button>
            <button
              onClick={() => setSourceType('remote')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'remote'
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              远程 URL
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={repoSource}
              onChange={(e) => setRepoSource(e.target.value)}
              placeholder={
                sourceType === 'local'
                  ? '/Users/xxx/my-project'
                  : 'https://github.com/user/repo.git'
              }
              className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-6 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '分析中...' : '开始分析'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          {message && <p className="mt-3 text-sm text-green-500">{message}</p>}
        </section>

        {/* Project List */}
        <section>
          <h2 className="text-lg font-medium mb-4">已分析项目</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-zinc-400">暂无项目，输入仓库地址开始分析</p>
          ) : (
            <div className="grid gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/analyze/${p.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{p.name}</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {p.sourceType === 'local' ? '本地' : '远程'} · {p.fileCount} 文件 · {p.commitCount} 提交
                      · {' '}
                      {p.lastAnalyzedAt
                        ? new Date(p.lastAnalyzedAt).toLocaleString('zh-CN')
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-medium ${riskColor(p.highRiskCount)}`}>
                      {p.highRiskCount} 高风险
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(p.id)
                      }}
                      className="text-sm text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 验证首页可访问**

Run: `npm run dev`
workdir: `app/`

Expected: 打开 http://localhost:3000 看到 Gitverse 首页

- [ ] **Step 4: 提交**

```bash
git add app/src/app/layout.tsx app/src/app/page.tsx
git commit -m "feat: implement project management homepage"
```

---

### Task 12: 可视化页面

**Files:**
- Create: `app/src/app/analyze/[id]/page.tsx`

- [ ] **Step 1: 创建分析可视化页面**

Create directory: `app/src/app/analyze/[id]`

Write `app/src/app/analyze/[id]/page.tsx`:
```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { GitAnalysis } from '@/types/analysis'
import FileGraph from '@/components/FileGraph'
import Timeline from '@/components/Timeline'
import FileDetails from '@/components/FileDetails'
import RiskPanel from '@/components/RiskPanel'

export default function AnalysisPage() {
  const params = useParams()
  const id = params.id as string

  const [analysis, setAnalysis] = useState<GitAnalysis | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [currentCommitIndex, setCurrentCommitIndex] = useState(-1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/analysis/${id}`)
        const data = await res.json()
        if (data.error) {
          setError(data.error)
        } else {
          setAnalysis(data)
        }
      } catch {
        setError('加载分析结果失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const selectedNode = analysis?.nodes.find((n) => n.id === selectedNodeId) || null

  const changedFiles = currentCommitIndex >= 0 && analysis
    ? analysis.commits[currentCommitIndex]?.filesChanged || []
    : []

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">加载中...</p>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-500">{error || '未找到分析结果'}</p>
        <a href="/" className="text-blue-500 text-sm hover:underline">返回首页</a>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            Projects
          </a>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm font-medium">{analysis.repoName}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>{analysis.totalFiles} 文件</span>
          <span>{analysis.totalCommits} 提交</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph Area */}
        <div className="flex-1 relative">
          <FileGraph
            nodes={analysis.nodes}
            edges={analysis.edges}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
            changedFiles={changedFiles}
          />
        </div>

        {/* Right Panel */}
        <aside className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto shrink-0">
          {selectedNode ? (
            <FileDetails node={selectedNode} edges={analysis.edges} />
          ) : (
            <RiskPanel
              nodes={analysis.nodes}
              onNodeSelect={setSelectedNodeId}
            />
          )}
        </aside>
      </div>

      {/* Timeline */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
        <Timeline
          commits={analysis.commits}
          currentIndex={currentCommitIndex}
          onChange={setCurrentCommitIndex}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/app/analyze/
git commit -m "feat: implement analysis visualization page"
```

---

### Task 13: FileGraph 组件（D3 力导向图）

**Files:**
- Create: `app/src/components/FileGraph.tsx`

- [ ] **Step 1: 创建 D3 力导向图组件**

Write `app/src/components/FileGraph.tsx`:
```typescript
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
      x: undefined as any,
      y: undefined as any,
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
      .attr('stroke', (d) => (d.id === selectedNodeId ? '#3b82f6' : 'none'))
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

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, selectedNodeId, onNodeSelect, changedFiles])

  // Highlight changed files on timeline change
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    if (changedFiles.length > 0) {
      svg.selectAll<SVGGElement, SimNode>('g g')
        .select('circle')
        .attr('stroke', (d: any) =>
          changedFiles.includes(d.id) ? '#f59e0b' : d.id === selectedNodeId ? '#3b82f6' : 'none'
        )
        .attr('stroke-width', (d: any) =>
          changedFiles.includes(d.id) ? 3 : 2
        )
    } else {
      svg.selectAll<SVGGElement, SimNode>('g g')
        .select('circle')
        .attr('stroke', (d: any) =>
          d.id === selectedNodeId ? '#3b82f6' : 'none'
        )
        .attr('stroke-width', 2)
    }
  }, [changedFiles, selectedNodeId])

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
    />
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/components/FileGraph.tsx
git commit -m "feat: add D3 force-directed graph component"
```

---

### Task 14: Timeline 时间轴组件

**Files:**
- Create: `app/src/components/Timeline.tsx`

- [ ] **Step 1: 创建时间轴组件**

Write `app/src/components/Timeline.tsx`:
```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import { CommitSnapshot } from '@/types/analysis'

interface Props {
  commits: CommitSnapshot[]
  currentIndex: number
  onChange: (index: number) => void
}

export default function Timeline({ commits, currentIndex, onChange }: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const sliderRef = useRef<HTMLInputElement>(null)

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    let idx = currentIndex < 0 ? 0 : currentIndex

    intervalRef.current = setInterval(() => {
      idx++
      if (idx >= commits.length) {
        idx = 0
        clearInterval(intervalRef.current!)
        setIsPlaying(false)
        onChange(-1)
        return
      }
      onChange(idx)
    }, 400)
  }, [isPlaying, currentIndex, commits.length, onChange])

  if (commits.length === 0) {
    return (
      <div className="px-6 py-3 text-sm text-zinc-400">
        暂无提交记录
      </div>
    )
  }

  const currentCommit = currentIndex >= 0 ? commits[currentIndex] : null

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="3" height="10" fill="white" /><rect x="8" y="1" width="3" height="10" fill="white" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="white" /></svg>
          )}
        </button>

        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={commits.length - 1}
          value={currentIndex < 0 ? 0 : currentIndex}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none bg-zinc-200 dark:bg-zinc-700 cursor-pointer 
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
        />

        <span className="text-xs text-zinc-400 min-w-[60px] text-right">
          {currentIndex + 1} / {commits.length}
        </span>
      </div>

      {currentCommit && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono text-zinc-400">{currentCommit.hash.slice(0, 7)}</span>
          {' · '}
          {new Date(currentCommit.date).toLocaleDateString('zh-CN')}
          {' · '}
          <span className="text-zinc-600 dark:text-zinc-300 truncate">{currentCommit.message.slice(0, 80)}</span>
          {' · '}
          <span className="text-blue-500">{currentCommit.filesChanged.length} 文件</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/components/Timeline.tsx
git commit -m "feat: add Timeline component with play/pause slider"
```

---

### Task 15: FileDetails + RiskPanel 组件

**Files:**
- Create: `app/src/components/FileDetails.tsx`
- Create: `app/src/components/RiskPanel.tsx`

- [ ] **Step 1: 创建 FileDetails 组件**

Write `app/src/components/FileDetails.tsx`:
```typescript
import { FileNode, DependencyEdge } from '@/types/analysis'

interface Props {
  node: FileNode
  edges: DependencyEdge[]
}

export default function FileDetails({ node, edges }: Props) {
  const relatedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  )

  const riskColors = {
    high: 'text-red-500 bg-red-50 dark:bg-red-950',
    medium: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    low: 'text-green-500 bg-green-50 dark:bg-green-950',
  }

  return (
    <div className="p-4">
      <h3 className="font-medium text-sm mb-4 break-all">{node.name}</h3>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-xs text-zinc-400">路径</span>
          <p className="text-xs mt-0.5 text-zinc-600 dark:text-zinc-300 break-all">{node.path}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">风险等级</span>
          <span className={`text-xs px-2 py-0.5 rounded ${riskColors[node.risk]}`}>
            {node.risk === 'high' ? '高' : node.risk === 'medium' ? '中' : '低'}
          </span>
        </div>

        {node.riskReason && (
          <p className="text-xs text-zinc-500">{node.riskReason}</p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold">{node.commitCount}</p>
            <p className="text-[10px] text-zinc-400">修改次数</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold text-green-500">+{node.addedLines}</p>
            <p className="text-[10px] text-zinc-400">新增行</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold text-red-500">-{node.deletedLines}</p>
            <p className="text-[10px] text-zinc-400">删除行</p>
          </div>
        </div>

        <div>
          <span className="text-xs text-zinc-400">热度</span>
          <div className="mt-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${node.heat}%`,
                backgroundColor:
                  node.heat > 66 ? '#ef4444' : node.heat > 33 ? '#eab308' : '#22c55e',
              }}
            />
          </div>
        </div>

        {relatedEdges.length > 0 && (
          <div>
            <span className="text-xs text-zinc-400">依赖关系 ({relatedEdges.length})</span>
            <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
              {relatedEdges.map((edge, i) => (
                <div key={i} className="text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded px-2 py-1">
                  {edge.source === node.id ? (
                    <>导入 → <span className="text-blue-500">{edge.target.split('/').pop()}</span></>
                  ) : (
                    <><span className="text-blue-500">{edge.source.split('/').pop()}</span> → 导入</>
                  )}
                  <span className="ml-2 text-zinc-300">权重 {edge.weight.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 RiskPanel 组件**

Write `app/src/components/RiskPanel.tsx`:
```typescript
import { FileNode } from '@/types/analysis'

interface Props {
  nodes: FileNode[]
  onNodeSelect: (id: string) => void
}

export default function RiskPanel({ nodes, onNodeSelect }: Props) {
  const sorted = [...nodes]
    .filter((n) => n.risk === 'high' || n.risk === 'medium')
    .sort((a, b) => b.heat - a.heat)

  const riskCounts = {
    high: nodes.filter((n) => n.risk === 'high').length,
    medium: nodes.filter((n) => n.risk === 'medium').length,
    low: nodes.filter((n) => n.risk === 'low').length,
  }

  return (
    <div className="p-4">
      <h3 className="font-medium text-sm mb-4">风险热点</h3>

      <div className="flex gap-3 mb-4 text-center text-xs">
        <div className="flex-1 bg-red-50 dark:bg-red-950 rounded p-2">
          <p className="text-red-500 font-semibold">{riskCounts.high}</p>
          <p className="text-zinc-400">高风险</p>
        </div>
        <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 rounded p-2">
          <p className="text-yellow-500 font-semibold">{riskCounts.medium}</p>
          <p className="text-zinc-400">中风险</p>
        </div>
        <div className="flex-1 bg-green-50 dark:bg-green-950 rounded p-2">
          <p className="text-green-500 font-semibold">{riskCounts.low}</p>
          <p className="text-zinc-400">低风险</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-400">暂无高风险文件</p>
      ) : (
        <div className="space-y-1">
          {sorted.map((node) => (
            <button
              key={node.id}
              onClick={() => onNodeSelect(node.id)}
              className="w-full text-left px-3 py-2 rounded text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <p className="font-medium truncate">{node.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={
                    node.risk === 'high' ? 'text-red-500' : 'text-yellow-500'
                  }
                >
                  {node.risk === 'high' ? '高' : '中'}
                </span>
                <span className="text-zinc-400">{node.commitCount} 次修改</span>
                <span className="text-zinc-300">|</span>
                <span className="text-zinc-400">热度 {node.heat}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add app/src/components/FileDetails.tsx app/src/components/RiskPanel.tsx
git commit -m "feat: add FileDetails and RiskPanel components"
```

---

### Task 16: 验证与收尾

- [ ] **Step 1: 删除不需要的模板文件**

```bash
rm -f app/public/next.svg app/public/vercel.svg app/public/file.svg app/public/globe.svg app/public/window.svg
```

- [ ] **Step 2: 清理 favicon**

保留 `app/src/app/favicon.ico`（用默认图标即可）

- [ ] **Step 3: 运行 lint 检查**

```bash
npm run lint
```
workdir: `app/`

Expected: 无错误（或仅 minor warnings）

- [ ] **Step 4: 构建验证**

```bash
npm run build
```
workdir: `app/`

Expected: 构建成功

- [ ] **Step 5: 更新 app/README.md 为简洁版**

Replace `app/README.md`:
```markdown
# Gitverse

可视化代码演进与依赖分析工具

## 功能

- 文件关系图：D3 力导向图展示文件依赖和热度
- 时间轴演进：播放 Git 提交历史
- 风险热点识别：自动标记高频修改和高耦合文件
- 多项目管理：支持输入本地路径或远程 Git 仓库 URL

## 技术栈

Next.js 16 + React 19 + TypeScript + TailwindCSS 4 + D3.js + MySQL

## 启动

```bash
cp .env.local.example .env.local  # 配置 DATABASE_URL
npm install
npm run dev
```

## API

- `POST /api/analyze` - 分析 Git 仓库
- `GET /api/analysis/[id]` - 获取分析结果
- `GET /api/projects` - 列出项目
- `DELETE /api/projects?id=xxx` - 删除项目
````

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "chore: cleanup template files and update documentation"
```
