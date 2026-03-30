import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { heavyLimiter } from '@/lib/rate-limit'
import { callSkillArchitect } from '@/lib/skill-architect-client'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  try {
    const out = await callSkillArchitect(`/v1/jobs/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver: auth.user.username, note: body?.note || '' }),
    })
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to approve job' }, { status: 502 })
  }
}

export const dynamic = 'force-dynamic'
