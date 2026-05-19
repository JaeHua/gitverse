'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import AuthButton from '@/components/AuthButton'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('gitverse_ai_key') || ''
    return ''
  })
  const [baseUrl, setBaseUrl] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('gitverse_ai_url') || 'https://api.deepseek.com'
    return 'https://api.deepseek.com'
  })
  const [model, setModel] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('gitverse_ai_model') || 'deepseek-chat'
    return 'deepseek-chat'
  })
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')

  function save() {
    localStorage.setItem('gitverse_ai_key', apiKey.trim())
    localStorage.setItem('gitverse_ai_url', baseUrl.trim() || 'https://api.deepseek.com')
    localStorage.setItem('gitverse_ai_model', model.trim() || 'deepseek-chat')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function testConnection() {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult('idle')
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim(),
          messages: [{ role: 'user', content: '回复"OK"' }] }),
      })
      const data = await res.json()
      setTestResult(data.content ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    }
    finally { setTesting(false) }
  }

  if (status === 'loading') {
    return <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950"><p className="text-zinc-500">加载中...</p></div>
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="#3b82f6"/>
              <circle cx="11" cy="10" r="3.5" fill="white" fillOpacity="0.9"/>
              <circle cx="18" cy="13" r="2.5" fill="white" fillOpacity="0.9"/>
              <circle cx="10" cy="18" r="2" fill="white" fillOpacity="0.9"/>
              <line x1="13.5" y1="9" x2="16" y2="12" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
            </svg>
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm font-medium">设置</span>
        </div>
        <AuthButton />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-lg font-semibold mb-6">AI 分析配置</h2>

        <p className="text-sm text-zinc-500 mb-8">
          配置 DeepSeek API 后，分析项目时可获得 AI 解读：文件说明、项目演进分析、代码审查建议。
          API Key 存储在浏览器本地，不会上传到服务器。
        </p>

        {!session && (
          <div className="mb-8 p-4 rounded-xl bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">请先登录后再配置 AI 功能</p>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-zinc-400 mt-1">
              从 <a href="https://platform.deepseek.com/api_keys" target="_blank" className="text-blue-500 hover:underline">DeepSeek 控制台</a> 获取
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">API 地址</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="deepseek-chat">deepseek-chat (推荐)</option>
              <option value="deepseek-reasoner">deepseek-reasoner (深度推理)</option>
            </select>
          </div>

          <div className="flex gap-3 items-center">
            <button
              onClick={save}
              className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              {saved ? '已保存 ✓' : '保存配置'}
            </button>
            <button
              onClick={testConnection}
              disabled={testing || !apiKey.trim()}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            {testResult === 'ok' && <span className="text-sm text-green-500">连接成功</span>}
            {testResult === 'fail' && <span className="text-sm text-red-500">连接失败</span>}
          </div>

          {apiKey && (
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${testResult === 'ok' ? 'bg-green-500' : testResult === 'fail' ? 'bg-red-500' : 'bg-zinc-300'}`} />
              <span className="text-zinc-500">
                {testResult === 'ok' ? '已连接' : testResult === 'fail' ? '连接失败' : '未验证'}
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
