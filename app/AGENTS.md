# Gitverse

可视化代码演进与依赖分析工具

## 启动

```bash
# 1. 启动 MySQL (Docker)
docker run -d --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=gitverse mysql:latest

# 2. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local: 填写 GITHUB_ID, GITHUB_SECRET, 生成 NEXTAUTH_SECRET

# 3. 启动
npm install
npm run dev
```

## 环境变量

| Key | 说明 |
|-----|------|
| `DATABASE_URL` | MySQL 连接串 |
| `GITHUB_ID` | GitHub OAuth App Client ID |
| `GITHUB_SECRET` | GitHub OAuth App Client Secret |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` |

## 技术栈

Next.js 16 / React 19 / TailwindCSS 4 / TypeScript / D3.js / MySQL / simple-git / NextAuth.js

## 项目结构

```
src/
├── app/
│   ├── page.tsx                    # 首页（项目管理）
│   ├── analyze/[id]/page.tsx       # 分析可视化页
│   ├── settings/page.tsx           # AI 设置页
│   └── api/
│       ├── analyze/route.ts        # POST 分析仓库
│       ├── analysis/[id]/route.ts  # GET 分析结果
│       ├── projects/route.ts       # GET/DELETE 项目
│       ├── ai/analyze/route.ts     # POST AI 分析
│       └── auth/[...nextauth]/     # NextAuth 路由
├── lib/
│   ├── git.ts      # Git 仓库解析
│   ├── deps.ts     # import 依赖分析
│   ├── heatmap.ts  # 热度/风险计算
│   ├── analyzer.ts # 分析编排 + DB
│   ├── auth.ts     # 认证工具
│   └── db/         # MySQL 连接 + Schema
├── components/
│   ├── FileTree.tsx      # D3 目录树（核心可视化）
│   ├── Timeline.tsx      # 时间轴播放器
│   ├── FileDetails.tsx   # 文件详情 + AI
│   ├── RiskPanel.tsx     # 风险面板
│   ├── AuthButton.tsx    # 登录按钮
│   └── Providers.tsx     # SessionProvider
└── types/
    └── analysis.ts       # 数据模型类型
```
