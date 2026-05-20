import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(_request.url)
    const hash = searchParams.get('hash')

    let rows: any[]
    if (hash) {
      rows = await query('SELECT * FROM commit_snapshots WHERE analysis_id = ? AND hash = ?', [id, hash])
    } else {
      rows = await query('SELECT * FROM commit_snapshots WHERE analysis_id = ? ORDER BY date DESC LIMIT 1', [id])
    }

    if (rows.length === 0) return NextResponse.json({ error: '未找到' }, { status: 404 })

    const c = rows[0]
    return NextResponse.json({
      hash: c.hash,
      date: c.date,
      message: c.message,
      filesChanged: typeof c.files_changed === 'string' ? JSON.parse(c.files_changed) : (c.files_changed || []),
    })
  } catch {
    return NextResponse.json({ error: '加载失败' }, { status: 500 })
  }
}
