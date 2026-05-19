'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { GitAnalysis } from '@/types/analysis'
import FileTree from '@/components/FileTree'
import Timeline from '@/components/Timeline'
import FileDetails from '@/components/FileDetails'
import AuthButton from '@/components/AuthButton'

export default function AnalysisPage() {
  const params = useParams()
  const id = params.id as string

  const [analysis, setAnalysis] = useState<GitAnalysis | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [currentCommitIndex, setCurrentCommitIndex] = useState(-1)
  const [showDrawer, setShowDrawer] = useState(false)
  const [drawerTab, setDrawerTab] = useState<'overview' | 'risk' | 'detail'>('overview')
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

  // When node selected, show detail in drawer
  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    if (nodeId) {
      setDrawerTab('detail')
      setShowDrawer(true)
    }
  }

  const coreModules = useMemo(() => {
    if (!analysis) return []
    const inDegree = new Map<string, number>()
    for (const edge of analysis.edges) inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    return [...inDegree.entries()].sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([path, count]) => ({ path, name: analysis.nodes.find((n) => n.id === path)?.name || path.split('/').pop() || path, importCount: count }))
  }, [analysis])

  const hotFiles = useMemo(() => {
    if (!analysis) return []
    return analysis.nodes.filter((n) => n.risk === 'high').slice(0, 15)
  }, [analysis])

  const selectedNode = analysis?.nodes.find((n) => n.id === selectedNodeId) || null

  const changedFiles =
    currentCommitIndex >= 0 && analysis
      ? analysis.commits[currentCommitIndex]?.filesChanged || []
      : []

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950"><p className="text-zinc-500">加载中...</p></div>
  }

  if (error || !analysis) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-500">{error || '未找到分析结果'}</p>
        <Link href="/" className="text-blue-500 text-sm hover:underline">返回首页</Link>
      </div>
    )
  }

  const highCount = hotFiles.length
  const riskCounts = {
    high: highCount,
    medium: analysis.nodes.filter((n) => n.risk === 'medium').length,
    low: analysis.nodes.filter((n) => n.risk === 'low').length,
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 h-12 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="shrink-0">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="#3b82f6"/>
              <circle cx="11" cy="10" r="3.5" fill="white" fillOpacity="0.9"/>
              <circle cx="18" cy="13" r="2.5" fill="white" fillOpacity="0.9"/>
              <circle cx="10" cy="18" r="2" fill="white" fillOpacity="0.9"/>
              <line x1="13.5" y1="9" x2="16" y2="12" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
            </svg>
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm font-medium truncate">{analysis.repoName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Quick stats */}
          <span className="text-xs text-zinc-400">{analysis.totalCommits} 提交</span>
          <span className="text-xs text-zinc-400">{analysis.totalFiles} 文件</span>
          <span className="text-xs text-zinc-400">{analysis.edges.length} 依赖</span>
          {highCount > 0 && <span className="text-xs text-red-400">{highCount} 高风险</span>}

          {/* Drawer toggle */}
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              showDrawer ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="12" height="12" rx="2" />
              <line x1="1" y1="5" x2="13" y2="5" />
              <line x1="9" y1="5" x2="9" y2="13" />
            </svg>
            详情
          </button>
          <AuthButton />
        </div>
      </header>

      {/* Main + Drawer */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        <div className="flex-1 relative bg-zinc-50 dark:bg-zinc-950">
          <FileTree
            nodes={analysis.nodes}
            edges={analysis.edges}
            commits={analysis.commits}
            selectedNodeId={selectedNodeId}
            onNodeSelect={handleNodeSelect}
            changedFiles={changedFiles}
            currentCommitIndex={currentCommitIndex}
            fileTimeline={analysis.fileTimeline}
          />
        </div>

        {/* Drawer */}
        {showDrawer && (
          <aside className="w-72 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto shrink-0">
            {/* Tabs */}
            <div className="flex border-b border-zinc-100 dark:border-zinc-800">
              {(['overview', 'risk', 'detail'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDrawerTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    drawerTab === tab
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {tab === 'overview' ? '概览' : tab === 'risk' ? '热点' : '详情'}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {drawerTab === 'overview' && (
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2">核心模块</h4>
                  <div className="space-y-1">
                    {coreModules.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedNodeId(m.path)}
                        className="w-full flex items-center justify-between text-left text-xs py-0.5"
                      >
                        <span className="text-blue-500 hover:text-blue-600 truncate max-w-[140px]">{m.name}</span>
                        <span className="text-zinc-400 shrink-0">{m.importCount}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2">风险分布</h4>
                  <div className="flex gap-2 text-xs text-center">
                    <div className="flex-1 bg-red-50 dark:bg-red-950 rounded p-1.5">
                      <p className="text-red-500 font-semibold">{riskCounts.high}</p>
                      <p className="text-zinc-400 text-[10px]">高</p>
                    </div>
                    <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 rounded p-1.5">
                      <p className="text-yellow-500 font-semibold">{riskCounts.medium}</p>
                      <p className="text-zinc-400 text-[10px]">中</p>
                    </div>
                    <div className="flex-1 bg-green-50 dark:bg-green-950 rounded p-1.5">
                      <p className="text-green-500 font-semibold">{riskCounts.low}</p>
                      <p className="text-zinc-400 text-[10px]">低</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2">文件类型</h4>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const types = new Map<string, number>()
                      for (const n of analysis.nodes) types.set(n.extension, (types.get(n.extension) || 0) + 1)
                      return [...types.entries()].sort(([, a], [, b]) => b - a).slice(0, 10)
                    })().map(([ext, count]) => (
                      <span key={ext} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {ext || 'other'} {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Risk Tab */}
            {drawerTab === 'risk' && (
              <div className="p-4">
                <div className="space-y-1">
                  {hotFiles.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedNodeId(f.id)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-red-500 font-medium truncate max-w-[160px]">{f.name}</span>
                        <span className="text-zinc-400">{f.commitCount}次</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{f.path}</p>
                    </button>
                  ))}
                  {hotFiles.length === 0 && <p className="text-xs text-zinc-400">无高风险文件</p>}
                </div>
              </div>
            )}

            {/* Detail Tab */}
            {drawerTab === 'detail' && (
              <div className="p-4">
                {selectedNode ? (
                  <FileDetails node={selectedNode} edges={analysis.edges} />
                ) : (
                  <p className="text-xs text-zinc-400">点击图中节点查看详情</p>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Timeline */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
        <Timeline
          commits={analysis.commits}
          currentIndex={currentCommitIndex}
          onChange={setCurrentCommitIndex}
          fileTimeline={analysis.fileTimeline}
        />
      </div>
    </div>
  )
}
