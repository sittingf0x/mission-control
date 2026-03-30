import { NextRequest, NextResponse } from 'next/server'
import { appendActivity, loadKanbanBoard, saveKanbanBoard } from '@openclaw/mc-client'
import { requireRole } from '@/lib/auth'
import { heavyLimiter } from '@/lib/rate-limit'
import { getOpenClawHome } from '@/lib/openclaw-home'
import { getDatabase } from '@/lib/db'
import { runOpenClaw } from '@/lib/command'
import { scanForInjection } from '@/lib/injection-guard'
import { logger } from '@/lib/logger'

type RouteCtx = { params: Promise<{ companyId: string; projectSlug: string; taskId: string }> }

function sanitizeSegment(s: string, max = 120): string | null {
  const t = decodeURIComponent(s || '').trim()
  if (!t || t.length > max) return null
  if (t === '_') return '_'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(t)) return null
  return t
}

type BoardTask = { id: string; columnId: string; blockedBy?: string[]; assigneeAgentId?: string; title?: string; description?: string }

function isBlocking(
  board: { tasks: BoardTask[] },
  depId: string,
): boolean {
  const dep = board.tasks.find((x) => x.id === depId)
  if (!dep) return false
  return dep.columnId !== 'done'
}

export async function POST(request: NextRequest, { params }: RouteCtx) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const { companyId: rawC, projectSlug: rawP, taskId } = await params
  const companyId = sanitizeSegment(rawC)
  const projectSlug = sanitizeSegment(rawP) || '_'
  if (!companyId || !taskId) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const force = new URL(request.url).searchParams.get('force') === '1'
  const home = getOpenClawHome()

  let board = (await loadKanbanBoard(home, companyId, projectSlug)) as {
    tasks: BoardTask[]
    columns: { id: string }[]
  }
  const task = board.tasks.find((t) => t.id === taskId)
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const blocked = (task.blockedBy || []).filter((id) => isBlocking(board, id))
  if (blocked.length > 0 && !force) {
    return NextResponse.json(
      {
        error: 'blocked',
        message: 'Blocked by tasks not in Done — resolve or use ?force=1',
        blockedTaskIds: blocked,
      },
      { status: 409 },
    )
  }

  const targetAgent = (task.assigneeAgentId && String(task.assigneeAgentId).trim()) || 'jarvis'
  const body = `${task.title}${task.description ? `\n\n${task.description}` : ''}`

  const inj = scanForInjection(body, { context: 'prompt' })
  if (!inj.safe && inj.matches.some((m) => m.severity === 'critical')) {
    return NextResponse.json({ error: 'Blocked: unsafe content in task' }, { status: 422 })
  }

  const db = getDatabase()
  const workspaceId = auth.user.workspace_id ?? 1
  const agent = db
    .prepare('SELECT * FROM agents WHERE name = ? AND workspace_id = ?')
    .get(targetAgent, workspaceId) as { session_key?: string } | undefined

  if (!agent?.session_key) {
    return NextResponse.json(
      { error: `Agent "${targetAgent}" has no session key — set in Mission Control agents` },
      { status: 400 },
    )
  }

  const from = auth.user.display_name || auth.user.username || 'operator'

  try {
    await runOpenClaw(
      [
        'gateway',
        'sessions_send',
        '--session',
        agent.session_key,
        '--message',
        `Kanban task (${companyId}): ${from}\n\n${body}`,
      ],
      { timeoutMs: 30000 },
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error({ err: e, taskId, targetAgent }, 'kanban start gateway send failed')
    return NextResponse.json({ error: `Gateway send failed: ${msg}` }, { status: 502 })
  }

  const r = appendActivity(
    board as unknown as Record<string, unknown>,
    taskId,
    `Started → ${targetAgent} (${from})`,
  )
  if (!r.ok || !('board' in r) || !r.board) {
    return NextResponse.json({ error: 'appendActivity failed' }, { status: 500 })
  }
  board = r.board as typeof board
  await saveKanbanBoard(home, board as never, companyId, projectSlug)

  return NextResponse.json({ ok: true, taskId, targetAgent })
}

export const dynamic = 'force-dynamic'
