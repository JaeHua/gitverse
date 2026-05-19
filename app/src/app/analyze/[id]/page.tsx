'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { GitAnalysis } from '@/types/analysis'
import FileGraph from '@/components/FileGraph'
import Timeline from '@/components/Timeline'
import FileDetails from '@/components/FileDetails'
import RiskPanel from '@/components/RiskPanel'
import AuthButton from '@/components/AuthButton'

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

  // Compute core modules (most imported by others = high in-degree)
  const coreModules = useMemo(() => {
    if (!analysis) return []
    const inDegree = new Map<string, number>()
    for (const edge of analysis.edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }
    return [...inDegree.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, count]) => {
        const node = analysis.nodes.find((n) => n.id === path)
        return { path, name: node?.name || path.split('/').pop() || path, importCount: count }
      })
  }, [analysis])

  // High-risk files
  const hotFiles = useMemo(() => {
    if (!analysis) return []
    return analysis.nodes
      .filter((n) => n.risk === 'high')
      .slice(0, 10)
  }, [analysis])

  // File type breakdown
  const fileTypes = useMemo(() => {
    if (!analysis) return []
    const types = new Map<string, number>()
    for (const node of analysis.nodes) {
      types.set(node.extension, (types.get(node.extension) || 0) + 1)
    }
    return [...types.entries()].sort(([, a], [, b]) => b - a)
  }, [analysis])

  const selectedNode = analysis?.nodes.find((n) => n.id === selectedNodeId) || null

  const changedFiles =
    currentCommitIndex >= 0 && analysis
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
        <Link href="/" className="text-blue-500 text-sm hover:underline">
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 h-14 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
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
        <div className="flex items-center gap-4 text-xs text-zinc-400 shrink-0">
          <span>{analysis.totalCommits} 提交</span>
          <span>{analysis.totalFiles} 文件</span>
          <AuthButton />
        </div>
      </header>

      {/* Overview Stats */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 shrink-0">
        <div className="grid grid-cols-4 gap-4 max-w-5xl mx-auto">
          {/* Core modules summary */}
          <div className="col-span-4 lg:col-span-1">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">核心模块</h3>
            <div className="space-y-1">
              {coreModules.slice(0, 5).map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <button
                    onClick={() => setSelectedNodeId(m.path)}
                    className="text-blue-500 hover:text-blue-600 truncate max-w-[140px] text-left"
                  >
                    {m.name}
                  </button>
                  <span className="text-zinc-400 shrink-0 ml-2">{m.importCount}引用</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk summary */}
          <div className="col-span-4 lg:col-span-1">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">风险热点</h3>
            <div className="space-y-1">
              {hotFiles.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <button
                    onClick={() => setSelectedNodeId(f.id)}
                    className="text-red-500 hover:text-red-600 truncate max-w-[140px] text-left"
                  >
                    {f.name}
                  </button>
                  <span className="text-zinc-400 shrink-0 ml-2">{f.commitCount}次</span>
                </div>
              ))}
              {hotFiles.length === 0 && (
                <p className="text-xs text-zinc-400">无高风险文件</p>
              )}
            </div>
          </div>

          {/* Activity overview */}
          <div className="col-span-4 lg:col-span-1">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">活动概览</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 rounded bg-zinc-50 dark:bg-zinc-800">
                <p className="text-sm font-semibold">{analysis.totalCommits}</p>
                <p className="text-[10px] text-zinc-400">提交</p>
              </div>
              <div className="text-center p-2 rounded bg-zinc-50 dark:bg-zinc-800">
                <p className="text-sm font-semibold">{analysis.totalFiles}</p>
                <p className="text-[10px] text-zinc-400">文件</p>
              </div>
              <div className="text-center p-2 rounded bg-zinc-50 dark:bg-zinc-800">
                <p className="text-sm font-semibold">{analysis.edges.length}</p>
                <p className="text-[10px] text-zinc-400">依赖</p>
              </div>
              <div className="text-center p-2 rounded bg-zinc-50 dark:bg-zinc-800">
                <p className="text-sm font-semibold">{hotFiles.length}</p>
                <p className="text-[10px] text-zinc-400">热点</p>
              </div>
            </div>
          </div>

          {/* File types */}
          <div className="col-span-4 lg:col-span-1">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">文件类型</h3>
            <div className="flex flex-wrap gap-1.5">
              {fileTypes.slice(0, 8).map(([ext, count]) => (
                <span key={ext} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {ext || 'other'} {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <FileGraph
            nodes={analysis.nodes}
            edges={analysis.edges}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
            changedFiles={changedFiles}
          />
        </div>

        <aside className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto shrink-0">
          {selectedNode ? (
            <FileDetails node={selectedNode} edges={analysis.edges} />
          ) : (
            <RiskPanel nodes={analysis.nodes} onNodeSelect={setSelectedNodeId} />
          )}
        </aside>
      </div>

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
