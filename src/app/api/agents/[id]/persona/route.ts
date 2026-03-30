import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { readPersonaFiles } from '@openclaw/mc-client'
import { getOpenClawHome } from '@/lib/openclaw-home'

/**
 * GET /api/agents/[id]/persona — SOUL.md, SKILLS.md, WORKING.md, MISSION.md from OpenClaw workspace (on-disk).
 * [id] is numeric id or agent name.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(_request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const workspaceId = auth.user.workspace_id ?? 1
  const db = getDatabase()

  let agentName = id
  if (!Number.isNaN(Number(id))) {
    const row = db
      .prepare('SELECT name FROM agents WHERE id = ? AND workspace_id = ?')
      .get(Number(id), workspaceId) as { name?: string } | undefined
    if (!row?.name) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    agentName = row.name
  } else {
    const row = db
      .prepare('SELECT name FROM agents WHERE name = ? AND workspace_id = ?')
      .get(id, workspaceId) as { name?: string } | undefined
    if (!row?.name) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    agentName = row.name
  }

  const home = getOpenClawHome()
  const files = await readPersonaFiles(home, agentName)
  return NextResponse.json({ agent: agentName, openclawHome: home, files })
}

export const dynamic = 'force-dynamic'
