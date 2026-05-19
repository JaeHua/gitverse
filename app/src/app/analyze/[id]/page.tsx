'use client'

import { useState, useEffect } from 'react'
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
          <Link
            href="/"
            className="flex items-center gap-1.5 shrink-0"
          >
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
          <span>{analysis.totalFiles} 文件</span>
          <span>{analysis.totalCommits} 提交</span>
          <AuthButton />
        </div>
      </header>

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
