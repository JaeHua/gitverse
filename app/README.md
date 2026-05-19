Gitverse

产品介绍

Gitverse 是一个可视化代码演进与依赖分析工具，旨在帮助开发者和团队快速理解大型项目的历史演进和核心模块。通过节点式可视化和时间轴动画，用户可以轻松查看文件提交频率、模块间依赖关系，以及技术债高发区，从而提高研发效率和协作效果。

核心功能

文件关系图：节点表示文件或模块，大小和颜色表示提交频率与热度，边表示依赖关系。

时间轴演进：可按时间轴播放项目历史演化，展示合并、修改、删除等状态变化。

风险热点识别：自动标记高频修改文件和高耦合文件，提示潜在技术债风险。

多项目管理：支持输入多个 Git 仓库地址，并按项目进行可视化展示。

技术栈

前端：

Next.js (React 框架)

TailwindCSS 或 Chakra UI（简约大气 UI，学习苹果官网

D3.js / vis.js / Cytoscape.js（节点图可视化）

Framer Motion（节点动画与状态演示）

后端：

Next.js API Routes（内置 Git 数据处理）

Node.js + simple-git（Git 仓库解析）

可选 Python 服务：GitPython + AST 分析文件依赖

数据存储：

Redis（缓存分析结果）

PostgreSQL / MySQL（历史数据与用户记录，可选）

JSON 文件（小型本地 demo）

项目结构示例

/Gitverse
├─ /pages
│  ├─ index.tsx        # 首页与项目选择
│  └─ api/
│     └─ analyze.ts    # Git 仓库分析接口
├─ /components
│  ├─ FileGraph.tsx    # 节点图组件
│  ├─ Timeline.tsx     # 时间轴组件
│  └─ FileDetails.tsx  # 文件详情面板
├─ /lib
│  └─ git.ts           # Git 数据解析逻辑
├─ /styles             # TailwindCSS 样式配置
└─ README.md

安装与启动

# 克隆仓库
git clone <repo-url>
cd Gitverse

# 安装依赖
npm install

# 启动开发环境
npm run dev

使用方法

打开首页，输入 Git 仓库地址。

系统分析仓库并生成节点图和文件关系。

可通过时间轴播放历史演进。

点击节点查看文件详情和提交热度。

高风险文件和热点区域会自动标记，便于技术债管理。

未来扩展

AI 分析 commit message 自动分类 refactor/feature/bugfix。

多仓库跨项目依赖分析。

支持导出可视化报告（PDF/图片）。

