import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { listLinearTeams } from '@/lib/linear-client'

/**
 * Linear (optional): `LINEAR_API_KEY` + `LINEAR_TEAM_ID` (or single team auto-pick).
 * `?teams=1` lists teams for the Kanban team picker (operator-only when key present).
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = readLimiter(request)
  if (limited) return limited

  const key = process.env.LINEAR_API_KEY?.trim()
  const team = process.env.LINEAR_TEAM_KEY?.trim() || process.env.LINEAR_TEAM_ID?.trim()
  const workspaceUrl = process.env.LINEAR_WORKSPACE_URL?.trim() || 'https://linear.app'
  const wantTeams = new URL(request.url).searchParams.get('teams') === '1'

  let teams: { id: string; key: string; name: string }[] | undefined
  if (key && wantTeams) {
    try {
      teams = await listLinearTeams(key)
    } catch {
      teams = undefined
    }
  }

  return NextResponse.json({
    configured: Boolean(key),
    teamKey: team || null,
    workspaceUrl,
    docs: 'https://linear.app/docs',
    teams,
  })
}

export const dynamic = 'force-dynamic'
