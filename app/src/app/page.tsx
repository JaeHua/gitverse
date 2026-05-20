'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ProjectSummary } from '@/types/analysis'
import AuthButton from '@/components/AuthButton'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/Toast'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: '登录请求失败',
  OAuthCallback: 'GitHub 授权回调失败',
  OAuthCreateAccount: '创建账号失败',
  Callback: '回调处理失败',
  OAuthAccountNotLinked: '该 GitHub 账号未关联',
  EmailSignin: '邮件验证失败',
  CredentialsSignin: '登录失败',
  SessionRequired: '请先登录',
}

function HomeContent() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const authError = useMemo(() => {
    const e = searchParams.get('error')
    return e ? (OAUTH_ERROR_MESSAGES[e] || '登录失败，请重试') : null
  }, [searchParams])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'files' | 'risk'>('date')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const [repoSource, setRepoSource] = useState('')
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Always try to load on mount, regardless of session state
    // The API will return 401 if not authenticated (handled silently)
    const t = setTimeout(loadProjects, 100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (data.projects) setProjects(data.projects)
      if (data.error) setError(data.error)
    } catch {
      // ignore
    }
  }

  const filteredProjects = useMemo(() => {
    let list = [...projects]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    switch (sortBy) {
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'files': list.sort((a, b) => b.fileCount - a.fileCount); break
      case 'risk': list.sort((a, b) => b.highRiskCount - a.highRiskCount); break
      default: break // date is default order from API
    }
    return list
  }, [projects, search, sortBy])

  async function handleAnalyze() {
    if (!repoSource.trim()) {
      setError('请输入仓库路径或 URL')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    setElapsed(0)
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)

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
        toast(data.error, 'error')
      } else if (data.analysisId) {
        toast('分析完成', 'success')
        setRepoSource('')
        await loadProjects()
        router.push(`/analyze/${data.analysisId}`)
      }
    } catch {
      setError('请求失败，请检查网络或仓库地址')
    } finally {
      clearInterval(timer)
      setLoading(false)
      setElapsed(0)
    }
  }

  async function handleDelete(projectId: string) {
    setDeleteTarget(projectId)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await fetch(`/api/projects?id=${deleteTarget}`, { method: 'DELETE' })
      toast('已删除', 'success')
      loadProjects()
    } catch { /* ignore */ }
    finally { setDeleteTarget(null) }
  }

  function riskColor(riskCount: number) {
    if (riskCount >= 10) return 'text-red-500'
    if (riskCount >= 5) return 'text-yellow-500'
    return 'text-green-500'
  }

  const isAuthenticated = status === 'authenticated' && session

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Navbar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-zinc-900 dark:text-zinc-100 hover:opacity-80 transition-opacity">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="#3b82f6"/>
              <circle cx="11" cy="10" r="3.5" fill="white" fillOpacity="0.9"/>
              <circle cx="18" cy="13" r="2.5" fill="white" fillOpacity="0.9"/>
              <circle cx="10" cy="18" r="2" fill="white" fillOpacity="0.9"/>
              <line x1="13.5" y1="9" x2="16" y2="12" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
              <line x1="12.5" y1="12.5" x2="15.5" y2="13" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
              <line x1="11" y1="16.5" x2="13" y2="14" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
            </svg>
            <span className="text-lg tracking-tight">Gitverse</span>
          </Link>
          <AuthButton />
        </div>
      </header>

      {status !== 'loading' && !isAuthenticated ? (
        /* Landing page for unauthenticated users */
        <main className="max-w-3xl mx-auto px-6 py-20">
          {authError && (
            <div className="mb-8 p-4 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900">
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{authError}</p>
            </div>
          )}

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 mb-6">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                <circle cx="11" cy="10" r="3.5" fill="white" fillOpacity="0.9"/>
                <circle cx="18" cy="13" r="2.5" fill="white" fillOpacity="0.9"/>
                <circle cx="10" cy="18" r="2" fill="white" fillOpacity="0.9"/>
                <line x1="13.5" y1="9" x2="16" y2="12" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
                <line x1="12.5" y1="12.5" x2="15.5" y2="13" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
                <line x1="11" y1="16.5" x2="13" y2="14" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
              </svg>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
              Gitverse
            </h1>
            <p className="text-base text-zinc-500 dark:text-zinc-400 mb-2">
              可视化代码演进与依赖分析
            </p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-md mx-auto mb-10">
              输入 Git 仓库，生成交互式文件关系图、时间轴演进和风险热点识别
            </p>

            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => signIn('github')}
                className="inline-flex items-center gap-3 px-8 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-md"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                使用 GitHub 账号登录
              </button>
              <p className="text-xs text-zinc-400">
                仅用于身份验证，不会读取你的代码仓库
              </p>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-6 text-center max-w-lg mx-auto">
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-blue-500">
                  <circle cx="10" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="14" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="6" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="12" y1="7.5" x2="12.5" y2="8.5" stroke="currentColor" strokeWidth="1"/>
                  <line x1="8" y1="8" x2="10.5" y2="9.5" stroke="currentColor" strokeWidth="1"/>
                </svg>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">依赖图谱</span>
                <span className="text-[10px] text-zinc-400">import 关系可视化</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-blue-500">
                  <line x1="4" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="6" cy="16" r="3" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="16" r="3" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
                </svg>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">时间轴</span>
                <span className="text-[10px] text-zinc-400">提交历史演进</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-blue-500">
                  <path d="M10 3L4 17h12L10 3z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="14" r="1" fill="currentColor" fillOpacity="0.5"/>
                  <line x1="10" y1="9" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">风险热点</span>
                <span className="text-[10px] text-zinc-400">技术债识别</span>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Authenticated: project management */
        <main className="max-w-5xl mx-auto px-6 py-12">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900">
              <div className="flex items-center justify-between">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-sm">×</button>
              </div>
            </div>
          )}

          <section className="mb-12">
            <div className="flex flex-col gap-4 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <h2 className="text-base font-medium">分析新仓库</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setSourceType('local')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sourceType === 'local'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  本地路径
                </button>
                <button
                  onClick={() => setSourceType('remote')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sourceType === 'remote'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
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
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-40 transition-colors shadow-sm"
                >
                  {loading ? `分析中... ${elapsed}s` : '开始分析'}
                </button>
              </div>
              {message && <p className="text-sm text-green-500">{message}</p>}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium">已分析项目</h2>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索项目..."
                  className="w-36 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none"
                >
                  <option value="date">时间</option>
                  <option value="name">名称</option>
                  <option value="files">文件数</option>
                  <option value="risk">风险</option>
                </select>
              </div>
            </div>
            {filteredProjects.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-sm text-zinc-400">
                  {search ? '没有匹配的项目' : '暂无项目，输入仓库地址开始分析'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredProjects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => router.push(`/analyze/${p.latestAnalysisId}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate group-hover:text-blue-500 transition-colors">{p.name}</h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        {p.sourceType === 'local' ? '本地' : '远程'} · {p.fileCount} 文件 · {p.commitCount} 提交 ·{' '}
                        {p.lastAnalyzedAt
                          ? new Date(p.lastAnalyzedAt).toLocaleString('zh-CN')
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <span className={`text-xs font-medium ${riskColor(p.highRiskCount)}`}>
                        {p.highRiskCount} 高风险
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(p.id)
                        }}
                        className="text-xs text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
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

      <ConfirmModal
        open={!!deleteTarget}
        title="删除项目"
        message="确定删除该项目？所有分析数据将被永久删除，无法恢复。"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
