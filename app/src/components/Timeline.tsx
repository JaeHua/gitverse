'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { CommitSnapshot } from '@/types/analysis'

interface Props {
  commits: CommitSnapshot[]
  currentIndex: number
  onChange: (index: number) => void
  fileTimeline?: Record<string, Array<{ date: string; type: 'added' | 'modified' | 'deleted' }>>
}

export default function Timeline({ commits, currentIndex, onChange, fileTimeline }: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    let idx = currentIndex < 0 ? 0 : currentIndex
    onChange(idx)

    intervalRef.current = setInterval(() => {
      idx++
      if (idx >= commits.length) {
        clearInterval(intervalRef.current!)
        setIsPlaying(false)
        onChange(-1)
        return
      }
      onChange(idx)
    }, 500)
  }, [isPlaying, currentIndex, commits.length, onChange])

  // Count file changes per commit for bar chart
  const changeCounts = commits.map((c) => {
    const added = c.filesChanged.filter((f) => {
      const events = fileTimeline?.[f]
      if (!events) return false
      // Find the event closest to this commit date
      const match = events.find((e) => {
        const eventDate = new Date(e.date).getTime()
        const commitDate = new Date(c.date).getTime()
        return Math.abs(eventDate - commitDate) < 60000 // within 1 minute
      })
      return match?.type === 'added'
    }).length
    const deleted = c.filesChanged.filter((f) => {
      const events = fileTimeline?.[f]
      if (!events) return false
      const match = events.find((e) => {
        const eventDate = new Date(e.date).getTime()
        const commitDate = new Date(c.date).getTime()
        return Math.abs(eventDate - commitDate) < 60000
      })
      return match?.type === 'deleted'
    }).length
    const modified = c.filesChanged.length - added - deleted
    return { added, deleted, modified }
  })

  // Draw mini bar chart
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || commits.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const barW = Math.max(w / commits.length - 1, 1)

    ctx.clearRect(0, 0, w, h)

    const maxChange = Math.max(...changeCounts.map((c) => c.added + c.deleted + c.modified), 1)

    for (let i = 0; i < commits.length; i++) {
      const x = i * (w / commits.length)
      const total = changeCounts[i].added + changeCounts[i].deleted + changeCounts[i].modified
      const barH = Math.max((total / maxChange) * h, 2)

      let yOffset = h - barH
      // Stack: deleted on bottom, modified in middle, added on top
      if (changeCounts[i].deleted > 0) {
        const segH = Math.max((changeCounts[i].deleted / total) * barH, 1)
        ctx.fillStyle = i <= currentIndex ? '#ef4444' : '#fca5a5'
        ctx.fillRect(x, yOffset, barW, segH)
        yOffset += segH
      }
      if (changeCounts[i].modified > 0) {
        const segH = Math.max((changeCounts[i].modified / total) * barH, 1)
        ctx.fillStyle = i <= currentIndex ? '#eab308' : '#fde68a'
        ctx.fillRect(x, yOffset, barW, segH)
        yOffset += segH
      }
      if (changeCounts[i].added > 0) {
        const segH = Math.max((changeCounts[i].added / total) * barH, 1)
        ctx.fillStyle = i <= currentIndex ? '#22c55e' : '#bbf7d0'
        ctx.fillRect(x, yOffset, barW, segH)
      }

      // Playhead indicator
      if (i === currentIndex) {
        ctx.fillStyle = '#3b82f6'
        ctx.fillRect(x - 0.5, 0, 2, h)
      }
    }
  }, [commits, currentIndex, changeCounts])

  if (commits.length === 0) {
    return (
      <div className="px-6 py-3 text-sm text-zinc-400">暂无提交记录</div>
    )
  }

  const currentCommit = currentIndex >= 0 ? commits[currentIndex] : null

  return (
    <div className="px-6 py-4">
      {/* Mini bar chart */}
      <canvas
        ref={canvasRef}
        className="w-full h-10 mb-2 rounded cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const idx = Math.floor((x / rect.width) * commits.length)
          if (idx >= 0 && idx < commits.length) onChange(idx)
        }}
      />

      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 新增
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> 修改
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 删除
        </span>
      </div>

      {/* Controls */}
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

      {/* Current commit info */}
      {currentCommit && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-zinc-400">{currentCommit.hash.slice(0, 7)}</span>
            <span className="text-zinc-300">·</span>
            <span>{new Date(currentCommit.date).toLocaleString('zh-CN')}</span>
          </div>
          <div className="text-zinc-600 dark:text-zinc-300 break-words line-clamp-2">
            {currentCommit.message}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-green-500">
              +{currentCommit.filesChanged.filter((f) => {
                const events = fileTimeline?.[f]
                if (!events) return false
                const match = events.find((e) => {
                  const ed = new Date(e.date).getTime()
                  const cd = new Date(currentCommit!.date).getTime()
                  return Math.abs(ed - cd) < 60000
                })
                return match?.type === 'added'
              }).length || 0} 新增
            </span>
            <span className="text-red-500">
              -{currentCommit.filesChanged.filter((f) => {
                const events = fileTimeline?.[f]
                if (!events) return false
                const match = events.find((e) => {
                  const ed = new Date(e.date).getTime()
                  const cd = new Date(currentCommit!.date).getTime()
                  return Math.abs(ed - cd) < 60000
                })
                return match?.type === 'deleted'
              }).length || 0} 删除
            </span>
            <span className="text-yellow-500">
              ~{currentCommit.filesChanged.length - 
                currentCommit.filesChanged.filter((f) => {
                  const events = fileTimeline?.[f]
                  if (!events) return false
                  const match = events.find((e) => {
                    const ed = new Date(e.date).getTime()
                    const cd = new Date(currentCommit!.date).getTime()
                    return Math.abs(ed - cd) < 60000
                  })
                  return match?.type === 'added' || match?.type === 'deleted'
                }).length || 0} 修改
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
