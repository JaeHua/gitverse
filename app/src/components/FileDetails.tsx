'use client'

import { useState } from 'react'
import { FileNode, DependencyEdge } from '@/types/analysis'
import { useToast } from '@/components/Toast'

interface Props {
  node: FileNode
  edges: DependencyEdge[]
}

export default function FileDetails({ node, edges }: Props) {
  const { toast } = useToast()
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState('')
  const [aiError, setAiError] = useState('')

  const relatedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  )

  const riskColors = {
    high: 'text-red-500 bg-red-50 dark:bg-red-950',
    medium: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    low: 'text-green-500 bg-green-50 dark:bg-green-950',
  }

  const imports = relatedEdges.filter((e) => e.source === node.id)
  const importedBy = relatedEdges.filter((e) => e.target === node.id)

  async function askAI() {
    const apiKey = localStorage.getItem('gitverse_ai_key')
    if (!apiKey) {
      setAiError('请先在设置页面配置 DeepSeek API Key')
      return
    }

    setAiLoading(true)
    setAiError('')
    setAiResult('')

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          baseUrl: localStorage.getItem('gitverse_ai_url') || 'https://api.deepseek.com',
          model: localStorage.getItem('gitverse_ai_model') || 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: '你是一个代码分析助手。用简洁的中文回答，重点分析文件在项目中的角色、改动模式和风险。',
            },
            {
              role: 'user',
              content: `分析这个文件：

文件名: ${node.name}
路径: ${node.path}
修改次数: ${node.commitCount}
新增: +${node.addedLines} 行
删除: -${node.deletedLines} 行
热度: ${node.heat}/100
风险: ${node.risk === 'high' ? '高' : node.risk === 'medium' ? '中' : '低'}

它导入了 ${imports.length} 个文件，被 ${importedBy.length} 个文件导入。

请简短分析:
1. 这个文件可能在项目中扮演什么角色
2. 为什么会有这样的修改模式
3. 是否存在风险或改进建议（200字以内）`,
            },
          ],
        }),
      })

      const data = await res.json()
      if (data.error) {
        setAiError(data.error)
      } else {
        setAiResult(data.content)
      }
    } catch {
      setAiError('AI 请求失败')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="p-4">
      <h3 className="font-medium text-sm mb-4 break-all">{node.name}</h3>

      <div className="space-y-3 text-sm">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">路径</span>
            <button onClick={() => { navigator.clipboard.writeText(node.path); toast('已复制', 'success') }}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors">复制</button>
          </div>
          <p className="text-xs mt-0.5 text-zinc-600 dark:text-zinc-300 break-all">{node.path}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">风险等级</span>
          <span className={`text-xs px-2 py-0.5 rounded ${riskColors[node.risk]}`}>
            {node.risk === 'high' ? '高' : node.risk === 'medium' ? '中' : '低'}
          </span>
        </div>

        {node.riskReason && <p className="text-xs text-zinc-500">{node.riskReason}</p>}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold">{node.commitCount}</p>
            <p className="text-[10px] text-zinc-400">修改次数</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold text-green-500">+{node.addedLines}</p>
            <p className="text-[10px] text-zinc-400">新增行</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold text-red-500">-{node.deletedLines}</p>
            <p className="text-[10px] text-zinc-400">删除行</p>
          </div>
        </div>

        <div>
          <span className="text-xs text-zinc-400">热度</span>
          <div className="mt-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${node.heat}%`,
                backgroundColor:
                  node.heat > 66 ? '#ef4444' : node.heat > 33 ? '#eab308' : '#22c55e',
              }}
            />
          </div>
        </div>

        {relatedEdges.length > 0 && (
          <div>
            <span className="text-xs text-zinc-400">依赖关系 ({relatedEdges.length})</span>
            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
              {imports.length > 0 && (
                <p className="text-[10px] text-zinc-400 mb-1">导入:</p>
              )}
              {imports.map((edge, i) => (
                <div key={i} className="text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded px-2 py-1">
                  → <span className="text-blue-500">{edge.target.split('/').pop()}</span>
                </div>
              ))}
              {importedBy.length > 0 && (
                <p className="text-[10px] text-zinc-400 mt-2 mb-1">被导入:</p>
              )}
              {importedBy.map((edge, i) => (
                <div key={i} className="text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded px-2 py-1">
                  ← <span className="text-blue-500">{edge.source.split('/').pop()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={askAI}
            disabled={aiLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {aiLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-1.5 border-white border-t-transparent rounded-full animate-spin" />
                AI 分析中...
              </span>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a4 4 0 0 1 4 4v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z"/>
                  <circle cx="12" cy="13" r="2"/>
                </svg>
                AI 分析
              </>
            )}
          </button>

          {aiError && (
            <p className="mt-2 text-xs text-red-500">{aiError}</p>
          )}

          {aiResult && (
            <div className="mt-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#6b7280">
                  <path d="M12 2a4 4 0 0 1 4 4v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z"/>
                </svg>
                <span className="text-[10px] text-zinc-500 font-medium">AI 解读</span>
              </div>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {aiResult}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
