import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { heavyLimiter } from '@/lib/rate-limit'
import { createLinearIssue, listLinearTeams } from '@/lib/linear-client'
import { z } from 'zod'

const bodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(25000).optional(),
  teamId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const apiKey = process.env.LINEAR_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'LINEAR_API_KEY not configured' }, { status: 503 })
  }

  const raw = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  let teamId = parsed.data.teamId || process.env.LINEAR_TEAM_ID?.trim()
  if (!teamId) {
    try {
      const teams = await listLinearTeams(apiKey)
      if (teams.length === 1) teamId = teams[0].id
      else if (teams.length === 0) {
        return NextResponse.json({ error: 'No Linear teams; set LINEAR_TEAM_ID' }, { status: 400 })
      } else {
        return NextResponse.json(
          {
            error: 'teamId required',
            teams: teams.map((t) => ({ id: t.id, key: t.key, name: t.name })),
          },
          { status: 400 },
        )
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  try {
    const issue = await createLinearIssue(apiKey, {
      teamId,
      title: parsed.data.title,
      description: parsed.data.description,
    })
    return NextResponse.json(issue)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export const dynamic = 'force-dynamic'
