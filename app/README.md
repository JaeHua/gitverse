# Gitverse

可视化代码演进与依赖分析工具。将 Git 仓库可视化为一个缓慢演化的生命系统——目录树展示文件结构，时间轴播放提交历史，依赖连线揭示模块关系，AI 辅助解读文件角色与风险。

## 核心功能

- **目录树可视化**：文件按目录层级展开，节点大小和颜色反映修改热度和风险等级。支持折叠/展开文件夹。
- **依赖关系图**：import 依赖以弧线连接，箭头表示导入方向，线条粗细表示依赖强度。
- **时间轴演进**：播放 Git 提交历史，树从最初几个文件动态生长——新增文件有机长出，修改文件轻微脉动，删除文件渐隐消失。
- **风险热点识别**：自动标记高频修改和高耦合文件，红色=高风险，黄色=中风险，绿色=低风险。
- **AI 分析**：集成 DeepSeek API，点击文件节点可获取 AI 解读；自动生成项目说明书（目录用途、核心模块、风险提示）。
- **搜索文件**：`/` 键聚焦搜索，匹配节点高亮，镜头自动聚焦。
- **提交 Diff**：时间轴选中提交后，抽屉展示变更文件列表（A/D/M 标记）及贡献者。
- **团队贡献**：自动统计每个文件的 Git 作者。
- **多项目管理**：支持本地路径和远程 Git 仓库 URL，按 GitHub 用户隔离数据。

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 (App Router) |
| UI | React 19 + TailwindCSS 4 |
| 语言 | TypeScript |
| 可视化 | D3.js（力导向树、时间轴、画布图表） |
| 认证 | NextAuth.js + GitHub OAuth |
| Git 解析 | simple-git |
| 依赖分析 | TypeScript Compiler API |
| 数据库 | MySQL 8 + mysql2 |
| AI | DeepSeek API（OpenAI 兼容） |

## 快速启动

```bash
# 1. 启动 MySQL (Docker)
docker run -d --name mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=gitverse \
  mysql:latest

# 2. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local:
#   GITHUB_ID=xxx          # GitHub OAuth App Client ID
#   GITHUB_SECRET=xxx      # GitHub OAuth App Client Secret
#   NEXTAUTH_SECRET=$(openssl rand -hex 32)
#   NEXTAUTH_URL=http://localhost:3000
#   DATABASE_URL=mysql://root:password@127.0.0.1:3306/gitverse

# 3. 启动
npm install
npm run dev
# → http://localhost:3000
```

## 环境变量

| Key | 说明 | 示例 |
|-----|------|------|
| `DATABASE_URL` | MySQL 连接串 | `mysql://root:password@127.0.0.1:3306/gitverse` |
| `GITHUB_ID` | GitHub OAuth App Client ID | `Ov23li...` |
| `GITHUB_SECRET` | GitHub OAuth App Client Secret | `4af89c...` |
| `NEXTAUTH_SECRET` | 会话加密密钥 | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | 应用 URL | `http://localhost:3000` |

## 项目结构

```
app/src/
├── app/
│   ├── page.tsx                     # 首页：项目管理、搜索、排序
│   ├── layout.tsx                   # 根布局 + SessionProvider
│   ├── analyze/[id]/page.tsx        # 分析可视化页（树 + 时间轴 + 抽屉）
│   ├── settings/page.tsx            # AI 配置（DeepSeek API Key）
│   └── api/
│       ├── analyze/route.ts         # POST 分析 Git 仓库
│       ├── analysis/[id]/route.ts   # GET 获取分析结果
│       ├── projects/route.ts        # GET 项目列表 / DELETE 删除
│       ├── ai/analyze/route.ts      # POST AI 文件分析
│       └── auth/[...nextauth]/      # NextAuth 路由处理
├── lib/
│   ├── git.ts                       # Git 克隆、日志解析、文件统计
│   ├── deps.ts                      # TypeScript import 依赖分析
│   ├── heatmap.ts                   # 热度 + 风险等级计算
│   ├── analyzer.ts                  # 分析主流程 + MySQL CRUD
│   ├── auth.ts                      # getServerSession 封装
│   └── db/
│       ├── index.ts                 # MySQL 连接池 + 重试 + 迁移
│       └── schema.ts                # 表结构 DDL
├── components/
│   ├── FileTree.tsx                 # D3 目录树（核心可视化，有机动画）
│   ├── Timeline.tsx                 # 时间轴播放器（canvas 柱状图）
│   ├── FileDetails.tsx              # 文件详情面板 + AI 分析按钮
│   ├── RiskPanel.tsx                # 风险热点面板
│   ├── AuthButton.tsx               # 登录/头像下拉菜单
│   └── Providers.tsx                # NextAuth SessionProvider
└── types/
    └── analysis.ts                  # GitAnalysis 数据模型类型定义
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/analyze` | 分析仓库，返回 `{ analysisId }` |
| `GET` | `/api/analysis/[id]` | 获取分析结果 JSON |
| `GET` | `/api/projects` | 列出当前用户项目 |
| `DELETE` | `/api/projects?id=xxx` | 删除项目 |
| `POST` | `/api/ai/analyze` | AI 分析文件（需 API Key） |

## 数据库

6 张表：

| 表 | 说明 |
|----|------|
| `users` | GitHub 用户信息 |
| `projects` | 仓库项目（关联 user_id） |
| `analyses` | 分析快照（含 project_readme 缓存） |
| `file_nodes` | 文件节点 |
| `dependency_edges` | 依赖边 |
| `commit_snapshots` | 提交记录 |

## 使用流程

1. 登录 GitHub 账号
2. 输入 Git 仓库路径或 URL，点击"开始分析"
3. 查看目录树：文件按层级展示，节点大小=热度，颜色=风险
4. 点击时间轴播放按钮，观察仓库从最初几个文件逐步生长
5. 点击文件节点查看详情：修改次数、增删行数、依赖关系
6. 在"设置"页面配置 DeepSeek API Key，自动生成项目说明书（"说明"标签）
7. 点击"AI 分析"按钮获取单个文件的 AI 解读
8. 点击文件夹折叠/展开子树（静态视图）
