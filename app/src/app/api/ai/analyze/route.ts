import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, baseUrl, model, messages } = body

    if (!apiKey || !messages) {
      return NextResponse.json({ error: '缺少 API Key 或消息' }, { status: 400 })
    }

    const res = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    })

    const data = await res.json()
    if (data.error) {
      return NextResponse.json({ error: data.error.message || 'AI 请求失败' }, { status: 500 })
    }

    return NextResponse.json({ content: data.choices?.[0]?.message?.content || '' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI 分析失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
