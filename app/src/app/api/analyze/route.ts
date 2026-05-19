import { NextRequest, NextResponse } from 'next/server'
import { analyzeRepo } from '@/lib/analyzer'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()

    if (!body.repoSource) {
      return NextResponse.json({ error: '缺少 repoSource 参数' }, { status: 400 })
    }

    const { repoSource, excludePatterns, maxCommits } = body

    if (repoSource.type === 'local' && !repoSource.path) {
      return NextResponse.json({ error: '本地路径不能为空' }, { status: 400 })
    }
    if (repoSource.type === 'remote' && !repoSource.url) {
      return NextResponse.json({ error: '远程仓库 URL 不能为空' }, { status: 400 })
    }

    const timeoutMs = 120000
    const controller = new AbortController()

    const analysisPromise = analyzeRepo(
      {
        repoSource,
        excludePatterns: excludePatterns || ['node_modules', '.git', 'dist', 'build', '.next'],
        maxCommits: maxCommits || 500,
      },
      userId
    )

    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => {
        controller.abort()
        reject(new Error('分析超时（超过2分钟），仓库过大'))
      }, timeoutMs)
    })

    const analysisId = await Promise.race([analysisPromise, timeoutPromise])
    return NextResponse.json({ analysisId })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '分析失败'
    if (message === 'UNAUTHORIZED' || message.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }
    console.error('Analyze error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
