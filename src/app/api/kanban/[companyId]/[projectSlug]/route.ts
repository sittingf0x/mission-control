import { NextRequest, NextResponse } from 'next/server'
import { loadKanbanBoard, saveKanbanBoard } from '@openclaw/mc-client'
import { requireRole } from '@/lib/auth'
import { readLimiter, heavyLimiter } from '@/lib/rate-limit'
import { getOpenClawHome } from '@/lib/openclaw-home'

type RouteCtx = { params: Promise<{ companyId: string; projectSlug: string }> }

function sanitizeSegment(s: string, max = 120): string | null {
  const t = decodeURIComponent(s || '').trim()
  if (!t || t.length > max) return null
  if (t === '_') return '_'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(t)) return null
  return t
}

export async function GET(request: NextRequest, { params }: RouteCtx) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = readLimiter(request)
  if (limited) return limited

  const { companyId: rawC, projectSlug: rawP } = await params
  const companyId = sanitizeSegment(rawC)
  const projectSlug = sanitizeSegment(rawP) || '_'
  if (!companyId) return NextResponse.json({ error: 'Invalid companyId' }, { status: 400 })

  try {
    const home = getOpenClawHome()
    const board = await loadKanbanBoard(home, companyId, projectSlug)
    return NextResponse.json(board)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const { companyId: rawC, projectSlug: rawP } = await params
  const companyId = sanitizeSegment(rawC)
  const projectSlug = sanitizeSegment(rawP) || '_'
  if (!companyId) return NextResponse.json({ error: 'Invalid companyId' }, { status: 400 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 })
  }
  const b = body as { version?: number; boardId?: string; columns?: unknown; tasks?: unknown }
  if (b.version !== 1 || !Array.isArray(b.columns) || !Array.isArray(b.tasks)) {
    return NextResponse.json({ error: 'Invalid board shape (need version 1, columns, tasks)' }, { status: 400 })
  }

  try {
    const home = getOpenClawHome()
    await saveKanbanBoard(home, b as never, companyId, projectSlug)
    const board = await loadKanbanBoard(home, companyId, projectSlug)
    return NextResponse.json(board)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
