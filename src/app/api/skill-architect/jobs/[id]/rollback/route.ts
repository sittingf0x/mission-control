import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { heavyLimiter } from '@/lib/rate-limit'
import { callSkillApply } from '@/lib/skill-architect-apply-client'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const backupId = String(body?.backupId || '').trim()
  if (!backupId) return NextResponse.json({ error: 'backupId is required' }, { status: 400 })

  try {
    const out = await callSkillApply('/v1/rollback', {
      method: 'POST',
      body: JSON.stringify({ jobId: id, backupId, requestedBy: auth.user.username }),
    })
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'rollback failed' }, { status: 422 })
  }
}

export const dynamic = 'force-dynamic'
