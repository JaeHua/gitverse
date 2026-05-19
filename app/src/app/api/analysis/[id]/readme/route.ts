import { NextRequest, NextResponse } from 'next/server'
import { saveProjectReadme } from '@/lib/analyzer'

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await _request.json()
    await saveProjectReadme(id, body.content || '')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
