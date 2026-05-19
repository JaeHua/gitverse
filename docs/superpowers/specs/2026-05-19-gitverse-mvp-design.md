# Gitverse MVP 设计文档

## 概述

Gitverse 是一个可视化代码演进与依赖分析工具，帮助开发者快速理解项目的历史演进和核心模块。通过节点式可视化和时间轴动画，展示文件提交频率、模块间依赖关系和技术债高发区。

MVP 定位：完整功能减配版，覆盖四个核心功能但每个做到最简。

## 技术栈

- **前端**：Next.js 16 + React 19 + TypeScript + TailwindCSS 4
- **可视化**：D3.js（力导向图、时间轴动画）
- **后端**：Next.js API Routes
- **Git 解析**：simple-git
- **依赖分析**：TypeScript Compiler API 解析 JS/TS import 语句
- **存储**：MySQL + mysql2

## 架构

```
Browser (Next.js Pages + D3.js)
       │
       ▼
POST /api/analyze  ←  { repoPath | repoUrl }
       │
       ▼
simple-git 克隆/读取仓库 → 提取 commit 历史 → 文件统计 → import 解析
       │
       ▼
写入 MySQL → 返回 analysisId → 客户端 GET /api/analysis/[id] → D3 渲染
```

API 只做分析，返回 JSON。客户端拿到结果后纯粹渲染。状态管理用 React useState/useReducer。

## 数据模型

```typescript
interface GitAnalysis {
  projectId: string
  repoName: string
  totalCommits: number
  totalFiles: number
  analyzedAt: string
  nodes: FileNode[]
  edges: DependencyEdge[]
  commits: CommitSnapshot[]
}

interface FileNode {
  id: string            // 文件相对路径
  path: string
  name: string          // 文件名
  extension: string     // .ts .tsx .js 等
  commitCount: number   // 该文件被修改的次数
  addedLines: number
  deletedLines: number
  heat: number          // 0-100 热度标准化值
  risk: 'high' | 'medium' | 'low'
  riskReason?: string
}

interface DependencyEdge {
  source: string        // import-er 节点 id
  target: string        // import-ee 节点 id
  weight: number        // 0-100
  type: 'direct'        // MVP 只做直接 import
}

interface CommitSnapshot {
  hash: string
  date: string          // ISO
  message: string
  filesChanged: string[]
  changeType: 'added' | 'modified' | 'deleted'
}
```

**风险判断规则**：`commitCount >= 20 → high, >= 10 → medium, < 10 → low`

**边权重计算**：`min(100, Math.log2(callCount + 1) * 20 + Math.min(60, commitFrequency * 5))`

## API Routes

### POST /api/analyze

触发分析，写入 MySQL，返回 analysisId。

**请求体**：
```typescript
{
  repoSource:
    | { type: 'local', path: string }
    | { type: 'remote', url: string }
  excludePatterns?: string[]   // 默认 ['node_modules', '.git', 'dist', 'build']
  maxCommits?: number          // 默认 500
}
```

**返回**：`{ analysisId: string } | { error: string }`

**处理流程**：
1. 验证输入（本地路径检查存在性 / 远程 URL 检查格式）
2. 远程 URL 通过 simple-git clone 到临时目录；本地路径直接打开
3. `git log --all --numstat` 提取 commit 统计
4. 遍历源文件，用 TypeScript Compiler API 解析 import 语句
5. 计算 heat、risk、edge weight
6. 写入 MySQL 各表，返回 analysisId

### GET /api/analysis/[id]

返回已缓存的分析结果。

**返回**：`GitAnalysis | { error: string }`

### GET /api/projects

列出所有已分析的项目。

**返回**：`{ projects: { id, name, sourceType, sourceInfo, lastAnalyzedAt, fileCount, commitCount }[] }`

### DELETE /api/projects/[id]

删除项目及关联数据（analyses、file_nodes、dependency_edges、commit_snapshots）。

**返回**：`{ success: true } | { error: string }`

## MySQL 表结构

```sql
CREATE TABLE projects (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source_type ENUM('local', 'remote') NOT NULL,
  source_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analyses (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  total_commits INT NOT NULL DEFAULT 0,
  total_files INT NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE file_nodes (
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
);

CREATE TABLE dependency_edges (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  weight DECIMAL(5,2) DEFAULT 0,
  type VARCHAR(20) DEFAULT 'direct',
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);

CREATE TABLE commit_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  hash VARCHAR(40) NOT NULL,
  date DATETIME NOT NULL,
  message TEXT,
  files_changed JSON,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
```

数据库驱动使用 `mysql2/promise`，连接串通过环境变量 `DATABASE_URL` 配置。

## 前端路由与组件

### 路由

```
/                  → 项目管理页
/analyze/[id]      → 分析结果可视化页
```

### 页面 1：`/` 项目管理页

- 顶部：Gitverse Logo + 标题
- 中部：输入区域（路径/URL 输入框 + 类型切换 local/remote + "开始分析" 按钮）
- 下方：已分析项目列表（卡片展示），每张卡片包含仓库名、分析时间、文件数、commit 数、高危文件数
- 点击项目卡片跳转 `/analyze/[id]`

### 页面 2：`/analyze/[id]` 分析可视化页

布局：左侧大图区 + 右侧信息面板（可收起）+ 底部时间轴横条

**核心组件**：

| 组件 | 功能 |
|------|------|
| `FileGraph` | D3 力导向图。节点=文件，节点大小=热度，节点颜色=风险(红/黄/绿)。边=import 依赖，边粗细=权重。 |
| `Timeline` | 底部时间轴播放器。拖动或自动播放，显示各时间点文件修改/新增/删除状态。 |
| `FileDetails` | 右侧面板。点击节点显示文件名、路径、修改次数、增删行数、风险等级、关联边列表。 |
| `RiskPanel` | 风险文件排名列表。按热度降序排列，点击某项高亮对应图节点。 |

**交互行为**：
- 节点可拖拽，画布可缩放平移
- hover 节点高亮其邻边
- 点击节点 → 右侧 FileDetails 面板展开
- 时间轴播放 → 节点按时间闪烁/变色提示变更
- 多项目间通过顶部面包屑导航切换

### 组件树

```
RootLayout
├── HomePage (/)
│   ├── ProjectInput (输入区域)
│   └── ProjectList (项目卡片列表)
│       └── ProjectCard
│
└── AnalysisPage (/analyze/[id])
    ├── Breadcrumb (导航)
    ├── FileGraph (D3 图)
    ├── FileDetails (侧面板)
    ├── RiskPanel (风险列表)
    └── Timeline (时间轴)
```

### 状态管理

- 页面级 `useState` 存储分析结果（`GitAnalysis` 对象）
- `FileGraph` 内部用 `useRef` 管理 D3 实例，避免 React 和 D3 冲突
- `FileDetails` 和 `RiskPanel` 通过回调函数（`onNodeSelect`）与 `FileGraph` 通信
- 不需要 Redux 或其他状态库

## 依赖解析

### JS/TS import 解析

使用 TypeScript Compiler API (`ts.createSourceFile`)，遍历 import 声明：

- `import { x } from './foo'` → 相对路径解析为项目内文件
- `import { x } from 'react'` → 跳过外部包（node_modules）
- 提取 source → target 映射，建立 FileNode id 之间的 DependencyEdge

### 边权重计算

边权重 = `min(100, Math.log2(callCount + 1) * 20 + Math.min(60, commitCoFrequency * 5))`

其中 `callCount` 是导入次数，`commitCoFrequency` 是两个文件在同一 commit 中被共同修改的次数。

### 节点热度

heat = `min(100, commitCount / maxCommitCount * 100)`，标准化到 0-100。

## 错误处理

- 本地路径不存在 → 返回 `{ error: "路径不存在" }`
- 远程 URL 无法克隆 → 返回 `{ error: "仓库克隆失败: <详情>" }`
- Git 仓库为空（无 commit）→ 返回 `{ error: "空仓库" }`
- 仓库无匹配源文件 → 返回空 nodes/edges，前端显示"未找到源文件"
- 分析超时（超过 30 秒）→ 中止并返回 `{ error: "分析超时" }`
- API 异常统一返回 `{ error: string }`，前端用 toast 提示

## 项目结构

```
app/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # 项目管理页
│   │   ├── analyze/
│   │   │   └── [id]/
│   │   │       └── page.tsx          # 可视化页
│   │   └── api/
│   │       ├── analyze/
│   │       │   └── route.ts          # POST /api/analyze
│   │       ├── analysis/
│   │       │   └── [id]/
│   │       │       └── route.ts      # GET /api/analysis/[id]
│   │       └── projects/
│   │           └── route.ts          # GET + DELETE /api/projects
│   ├── lib/
│   │   ├── git.ts                    # Git 仓库解析（simple-git 封装）
│   │   ├── deps.ts                   # import 依赖解析（TypeScript Compiler API）
│   │   ├── analyzer.ts               # 分析主流程编排
│   │   ├── heatmap.ts                # 热度与风险计算
│   │   └── db/
│   │       ├── index.ts              # MySQL 连接与 CRUD（mysql2/promise）
│   │       └── schema.ts             # DDL / 表结构
│   ├── components/
│   │   ├── FileGraph.tsx             # D3 力导向图组件
│   │   ├── Timeline.tsx              # 时间轴组件
│   │   ├── FileDetails.tsx           # 文件详情面板
│   │   ├── RiskPanel.tsx             # 风险热点列表
│   │   ├── ProjectInput.tsx          # 项目输入区域
│   │   ├── ProjectCard.tsx           # 项目卡片
│   │   ├── ProjectList.tsx           # 项目列表
│   │   └── Breadcrumb.tsx            # 面包屑导航
│   └── types/
│       └── analysis.ts               # GitAnalysis 及其子类型定义
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts (via @tailwindcss/postcss)
```
