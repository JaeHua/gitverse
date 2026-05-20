'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { GitAnalysis } from '@/types/analysis'
import FileTree from '@/components/FileTree'
import Timeline from '@/components/Timeline'
import FileDetails from '@/components/FileDetails'
import AuthButton from '@/components/AuthButton'
import { useToast } from '@/components/Toast'

type Tab = 'overview' | 'risk' | 'readme' | 'diff' | 'detail'

export default function AnalysisPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const id = params.id as string

  const [analysis, setAnalysis] = useState<GitAnalysis | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [currentCommitIndex, setCurrentCommitIndex] = useState(-1)
  const [showDrawer, setShowDrawer] = useState(false)
  const [drawerTab, setDrawerTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [readmeLoading, setReadmeLoading] = useState(false)
  const [readmeContent, setReadmeContent] = useState('')
  const [search, setSearch] = useState('')

  // / shortcut to focus search box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        const el = document.querySelector<HTMLInputElement>('input[placeholder*="搜索文件"]')
        el?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/analysis/${id}`)
        const data = await res.json()
        if (data.error) { setError(data.error) }
        else {
          setAnalysis(data)
          if (data.projectReadme) { setReadmeContent(data.projectReadme) }
          else {
            const apiKey = typeof window !== 'undefined' ? localStorage.getItem('gitverse_ai_key') : null
            if (apiKey) setTimeout(() => autoGenerate(apiKey, data), 500)
          }
        }
      } catch { setError('加载分析结果失败') }
      finally { setLoading(false) }
    }

    async function autoGenerate(apiKey: string, analysisData: GitAnalysis) {
      setReadmeLoading(true)
      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey,
            baseUrl: localStorage.getItem('gitverse_ai_url') || 'https://api.deepseek.com',
            model: localStorage.getItem('gitverse_ai_model') || 'deepseek-chat',
            messages: [
              { role: 'system', content: '你是一个代码架构分析专家。用简洁的中文，输出结构化的项目说明。' },
              { role: 'user', content: buildReadmePrompt(analysisData) },
            ] }),
        })
        const data = await res.json()
        if (data.content) {
          setReadmeContent(data.content)
          fetch(`/api/analysis/${id}/readme`, { method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: data.content }) }).catch(() => {})
        }
      } catch { /* ignore */ }
      finally { setReadmeLoading(false) }
    }

    load()
  }, [id])

  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    if (nodeId) { setDrawerTab('detail'); setShowDrawer(true) }
  }

  const coreModules = useMemo(() => {
    if (!analysis) return []
    const inDegree = new Map<string, number>()
    for (const edge of analysis.edges) inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    return [...inDegree.entries()].sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([path, count]) => ({ path, name: analysis.nodes.find(n => n.id === path)?.name || path.split('/').pop() || path, importCount: count }))
  }, [analysis])

  const hotFiles = useMemo(() => {
    if (!analysis) return []
    return analysis.nodes.filter(n => n.risk === 'high').slice(0, 15)
  }, [analysis])

  const selectedNode = analysis?.nodes.find(n => n.id === selectedNodeId) || null
  const changedFiles = currentCommitIndex >= 0 && analysis ? analysis.commits[currentCommitIndex]?.filesChanged || [] : []
  const highCount = hotFiles.length
  const riskCounts = { high: highCount, medium: analysis?.nodes.filter(n => n.risk === 'medium').length || 0, low: analysis?.nodes.filter(n => n.risk === 'low').length || 0 }

  if (loading) return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 h-12 flex items-center gap-3">
        <div className="w-5 h-5 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="w-32 h-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">加载分析数据...</p>
        </div>
      </div>
    </div>
  )
  if (error || !analysis) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950 px-6">
      <p className="text-red-500">{error || '未找到分析结果'}</p>
      <div className="flex gap-3">
        <Link href="/" className="text-blue-500 text-sm hover:underline">返回首页</Link>
        <button onClick={() => router.refresh()}
          className="text-blue-500 text-sm hover:underline">重试</button>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 h-12 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="shrink-0">
            <Image src="/gitverse.jpeg" alt="Gitverse" width={20} height={20} className="rounded-sm" />
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm font-medium truncate">{analysis.repoName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-zinc-400">{analysis.totalCommits} 提交</span>
          <span className="text-xs text-zinc-400">{analysis.totalFiles} 文件</span>
          <span className="text-xs text-zinc-400">{analysis.edges.length} 依赖</span>
          {highCount > 0 && <span className="text-xs text-red-400">{highCount} 高风险</span>}
          <button onClick={() => setShowDrawer(!showDrawer)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showDrawer ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="12" height="12" rx="2" /><line x1="1" y1="5" x2="13" y2="5" /><line x1="9" y1="5" x2="9" y2="13" />
            </svg>
            详情
          </button>
          <AuthButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative bg-zinc-50 dark:bg-zinc-950">
          {/* Search */}
          {currentCommitIndex < 0 && (
          <div className="absolute top-3 right-3 z-10">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索文件... (/)"
              className="w-40 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/90 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              onKeyDown={e => { if (e.key === 'Escape') setSearch('') }}
            />
          </div>
          )}
          <FileTree nodes={analysis.nodes} edges={analysis.edges} commits={analysis.commits}
            selectedNodeId={selectedNodeId} onNodeSelect={handleNodeSelect}
            changedFiles={changedFiles}             currentCommitIndex={currentCommitIndex} fileTimeline={analysis.fileTimeline}
            searchQuery={currentCommitIndex < 0 ? search : ''} />
        </div>

        {showDrawer && (
          <aside className="w-72 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto shrink-0">
            <div className="flex border-b border-zinc-100 dark:border-zinc-800">
              {(['overview', 'risk', 'readme', 'diff', 'detail'] as Tab[]).map(tab => (
                <button key={tab} onClick={() => setDrawerTab(tab)}
                  className={`flex-1 py-2 text-[10px] font-medium transition-colors ${drawerTab === tab ? 'text-blue-500 border-b-2 border-blue-500' : 'text-zinc-400 hover:text-zinc-600'}`}>
                  {tab === 'overview' ? '概览' : tab === 'risk' ? '热点' : tab === 'readme' ? '说明' : tab === 'diff' ? 'Diff' : '详情'}
                </button>
              ))}
            </div>

            {drawerTab === 'overview' && (
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2">核心模块</h4>
                  <div className="space-y-1">
                    {coreModules.map((m, i) => (
                      <button key={i} onClick={() => setSelectedNodeId(m.path)}
                        className="w-full flex items-center justify-between text-left text-xs py-0.5">
                        <span className="text-blue-500 hover:text-blue-600 truncate max-w-[140px]">{m.name}</span>
                        <span className="text-zinc-400 shrink-0">{m.importCount}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2">风险分布</h4>
                  <div className="flex gap-2 text-xs text-center">
                    <div className="flex-1 bg-red-50 dark:bg-red-950 rounded p-1.5"><p className="text-red-500 font-semibold">{riskCounts.high}</p><p className="text-zinc-400 text-[10px]">高</p></div>
                    <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 rounded p-1.5"><p className="text-yellow-500 font-semibold">{riskCounts.medium}</p><p className="text-zinc-400 text-[10px]">中</p></div>
                    <div className="flex-1 bg-green-50 dark:bg-green-950 rounded p-1.5"><p className="text-green-500 font-semibold">{riskCounts.low}</p><p className="text-zinc-400 text-[10px]">低</p></div>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2">文件类型</h4>
                  <div className="flex flex-wrap gap-1">
                    {buildFileTypes(analysis).map(({ ext, count }) => (
                      <span key={ext} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{ext || 'other'} {count}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {drawerTab === 'risk' && (
              <div className="p-4">
                <div className="space-y-1">
                  {hotFiles.map(f => (
                    <button key={f.id} onClick={() => setSelectedNodeId(f.id)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <div className="flex items-center justify-between"><span className="text-red-500 font-medium truncate max-w-[160px]">{f.name}</span><span className="text-zinc-400">{f.commitCount}次</span></div>
                      <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{f.path}</p>
                    </button>
                  ))}
                  {hotFiles.length === 0 && <p className="text-xs text-zinc-400">无高风险文件</p>}
                </div>
              </div>
            )}

            {drawerTab === 'diff' && (
              <div className="p-4">
                <h4 className="text-xs font-medium text-zinc-500 mb-3">提交变更</h4>
                {currentCommitIndex >= 0 ? (
                  (() => {
                    const commit = analysis.commits[currentCommitIndex]
                    const files = commit?.filesChanged || []
                    const addedFiles = files.filter(f => {
                      const events = analysis.fileTimeline?.[f]
                      return events?.some(e => {
                        const diff = Math.abs(new Date(e.date).getTime() - new Date(commit.date).getTime())
                        return diff < 60000 && e.type === 'added'
                      })
                    }).length || 0
                    const deletedFiles = files.filter(f => {
                      const events = analysis.fileTimeline?.[f]
                      return events?.some(e => {
                        const diff = Math.abs(new Date(e.date).getTime() - new Date(commit.date).getTime())
                        return diff < 60000 && e.type === 'deleted'
                      })
                    }).length || 0
                    return (
                      <div className="space-y-3">
                        <div className="flex gap-3 text-xs">
                          <span className="text-green-500">+{addedFiles} 新增</span>
                          <span className="text-red-500">-{deletedFiles} 删除</span>
                          <span className="text-zinc-400">~{files.length - addedFiles - deletedFiles} 修改</span>
                        </div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-300 break-words">
                          {commit.message}
                        </div>
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {files.map((f, i) => {
                            const events = analysis.fileTimeline?.[f]
                            const isAdded = events?.some(e => {
                              const diff = Math.abs(new Date(e.date).getTime() - new Date(commit.date).getTime())
                              return diff < 60000 && e.type === 'added'
                            })
                            const isDeleted = events?.some(e => {
                              const diff = Math.abs(new Date(e.date).getTime() - new Date(commit.date).getTime())
                              return diff < 60000 && e.type === 'deleted'
                            })
                            return (
                              <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className={isAdded ? 'text-green-500' : isDeleted ? 'text-red-500' : 'text-yellow-500'}>
                                  {isAdded ? 'A' : isDeleted ? 'D' : 'M'}
                                </span>
                                <button onClick={() => setSelectedNodeId(f)}
                                  className="text-zinc-600 dark:text-zinc-400 truncate hover:text-blue-500 text-left">
                                  {f.split('/').pop()}
                                </button>
                                <span className="text-zinc-400 text-[10px] ml-auto shrink-0">
                                  {analysis.fileAuthors?.[f] || ''}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-xs text-zinc-400">播放时间轴后查看提交变更</p>
                )}
              </div>
            )}

            {drawerTab === 'detail' && (
              <div className="p-4">
                {selectedNode ? <FileDetails node={selectedNode} edges={analysis.edges} />
                  : <p className="text-xs text-zinc-400">点击图中节点查看详情</p>}
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
        <Timeline commits={analysis.commits} currentIndex={currentCommitIndex} onChange={setCurrentCommitIndex} fileTimeline={analysis.fileTimeline} />
      </div>
    </div>
  )
}

function buildReadmePrompt(a: GitAnalysis): string {
  const topDirs = buildTopDirs(a)
  const coreMods = buildCoreModules(a)
  const high = a.nodes.filter(n => n.risk === 'high').length
  const medium = a.nodes.filter(n => n.risk === 'medium').length
  const low = a.nodes.filter(n => n.risk === 'low').length
  const fTypes = buildFileTypes(a)

  return `请根据以下数据生成项目说明书：

## 项目: ${a.repoName}
## 提交总数: ${a.totalCommits}, 文件总数: ${a.totalFiles}

## 目录结构:
${topDirs.map(d => `- ${d.name} (${d.files}个文件): [推断用途]`).join('\n')}

## 核心模块（被依赖最多的文件）:
${coreMods.map(m => `- ${m.name}: 被${m.count}个文件导入`).join('\n')}

## 风险概况:
高风险${high}个, 中风险${medium}个, 低风险${low}个

## 文件类型:
${fTypes.map(t => `${t.ext}: ${t.count}个`).join(', ')}

请用以下markdown格式输出（300字以内）：
## 项目概述
[一句话]

## 目录说明
[每个目录一行，说明用途]

## 核心模块
[列出2-3个最重要的，说明角色]

## 注意事项
[如有高风险模块，简要提示]`
}

function buildTopDirs(a: GitAnalysis) {
  const dirs = new Map<string, number>()
  for (const n of a.nodes) {
    const parts = n.path.split('/')
    if (parts.length >= 2) {
      const top = parts.slice(0, parts.length > 2 ? 2 : 1).join('/')
      dirs.set(top, (dirs.get(top) || 0) + 1)
    }
  }
  return [...dirs.entries()].sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, files]) => ({ name, files }))
}

function buildCoreModules(a: GitAnalysis) {
  const inDeg = new Map<string, number>()
  for (const e of a.edges) inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1)
  return [...inDeg.entries()].sort(([, a], [, b]) => b - a).slice(0, 5)
    .map(([path, count]) => ({ name: a.nodes.find(n => n.id === path)?.name || path.split('/').pop() || path, count }))
}

function buildFileTypes(a: GitAnalysis) {
  const types = new Map<string, number>()
  for (const n of a.nodes) types.set(n.extension, (types.get(n.extension) || 0) + 1)
  return [...types.entries()].sort(([, a], [, b]) => b - a).slice(0, 8).map(([ext, count]) => ({ ext: ext || 'other', count }))
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h3 class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mt-3 mb-1">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 class="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-2 mb-1">$1</h4>')
    .replace(/^- (.+)$/gm, '<div class="ml-2">• $1</div>')
    .replace(/\n\n/g, '<br/>')
}
