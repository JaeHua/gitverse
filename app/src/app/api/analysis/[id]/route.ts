import { NextRequest, NextResponse } from 'next/server'
import { getAnalysis } from '@/lib/analyzer'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const analysis = await getAnalysis(id)

    if (!analysis) {
      return NextResponse.json({ error: '分析结果不存在' }, { status: 404 })
    }

    return NextResponse.json(analysis)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取分析结果失败'
    console.error('Get analysis error:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
