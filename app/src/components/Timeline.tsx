'use client'

import { useState, useRef, useCallback } from 'react'
import { CommitSnapshot } from '@/types/analysis'

interface Props {
  commits: CommitSnapshot[]
  currentIndex: number
  onChange: (index: number) => void
}

export default function Timeline({ commits, currentIndex, onChange }: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    let idx = currentIndex < 0 ? 0 : currentIndex

    intervalRef.current = setInterval(() => {
      idx++
      if (idx >= commits.length) {
        idx = 0
        clearInterval(intervalRef.current!)
        setIsPlaying(false)
        onChange(-1)
        return
      }
      onChange(idx)
    }, 400)
  }, [isPlaying, currentIndex, commits.length, onChange])

  if (commits.length === 0) {
    return (
      <div className="px-6 py-3 text-sm text-zinc-400">暂无提交记录</div>
    )
  }

  const currentCommit = currentIndex >= 0 ? commits[currentIndex] : null

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="3" height="10" fill="white" />
              <rect x="8" y="1" width="3" height="10" fill="white" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <polygon points="2,1 11,6 2,11" fill="white" />
            </svg>
          )}
        </button>

        <input
          type="range"
          min={0}
          max={commits.length - 1}
          value={currentIndex < 0 ? 0 : currentIndex}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none bg-zinc-200 dark:bg-zinc-700 cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
        />

        <span className="text-xs text-zinc-400 min-w-[60px] text-right">
          {currentIndex + 1} / {commits.length}
        </span>
      </div>

      {currentCommit && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono text-zinc-400">{currentCommit.hash.slice(0, 7)}</span>
          {' · '}
          {new Date(currentCommit.date).toLocaleDateString('zh-CN')}
          {' · '}
          <span className="text-zinc-600 dark:text-zinc-300 truncate">
            {currentCommit.message.slice(0, 80)}
          </span>
          {' · '}
          <span className="text-blue-500">{currentCommit.filesChanged.length} 文件</span>
        </div>
      )}
    </div>
  )
}
