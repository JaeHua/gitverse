import { NextRequest, NextResponse } from 'next/server'
import { analyzeRepo } from '@/lib/analyzer'

export async function POST(request: NextRequest) {
  try {
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

    const analysisId = await analyzeRepo({
      repoSource,
      excludePatterns: excludePatterns || ['node_modules', '.git', 'dist', 'build', '.next'],
      maxCommits: maxCommits || 500,
    })

    return NextResponse.json({ analysisId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '分析失败'
    console.error('Analyze error:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
