import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { heavyLimiter, readLimiter } from '@/lib/rate-limit'
import { callSkillArchitect } from '@/lib/skill-architect-client'
import { z } from 'zod'

const bodySchema = z.object({
  requester: z.string().min(1).max(80).default('jarvis'),
  topic: z.string().max(300).optional(),
  urls: z.array(z.string().url()).min(1).max(10),
  targetAgent: z.string().min(1).max(80),
  targetSubagent: z.string().max(80).optional(),
  mode: z.enum(['skill-only', 'spec-tree', 'mixed']).default('mixed'),
})

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues.map(i => i.message) }, { status: 400 })
  }

  try {
    const out = await callSkillArchitect('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    })
    return NextResponse.json(out, { status: 202 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create job' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = readLimiter(request)
  if (limited) return limited

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    const out = await callSkillArchitect(`/v1/jobs/${encodeURIComponent(id)}`)
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch job' }, { status: 502 })
  }
}

export const dynamic = 'force-dynamic'
