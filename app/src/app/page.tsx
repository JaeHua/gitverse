'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { ProjectSummary } from '@/types/analysis'
import AuthButton from '@/components/AuthButton'

export default function HomePage() {
  const { data: session, status } = useSession()
  const [repoSource, setRepoSource] = useState('')
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (session) loadProjects()
  }, [session])

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
        setMessage('分析完成!')
        setRepoSource('')
        await loadProjects()
        window.location.href = `/analyze/${data.analysisId}`
      }
    } catch {
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
          <AuthButton />
        </div>
      </header>

      {status === 'loading' ? (
        <main className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">加载中...</p>
          </div>
        </main>
      ) : !session ? (
        <main className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
            <h2 className="text-xl font-semibold">可视化代码演进分析</h2>
            <p className="text-sm text-zinc-500 max-w-md">
              登录后即可分析 Git 仓库，查看文件依赖关系图、时间轴演进和风险热点识别。
            </p>
          </div>
        </main>
      ) : (
      <main className="max-w-5xl mx-auto px-6 py-12">
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
                  onClick={() => (window.location.href = `/analyze/${p.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{p.name}</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {p.sourceType === 'local' ? '本地' : '远程'} · {p.fileCount} 文件 · {p.commitCount} 提交 ·{' '}
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
      )}
    </div>
  )
}
