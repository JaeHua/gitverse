import { NextRequest, NextResponse } from 'next/server'
import { getProjects, deleteProject } from '@/lib/analyzer'

export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json({ projects })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取项目列表失败'
    console.error('Get projects error:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 })
    }
    await deleteProject(id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除项目失败'
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
