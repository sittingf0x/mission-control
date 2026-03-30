import { NextRequest, NextResponse } from 'next/server'
import { readCompanyRegistry, readActiveCompany } from '@openclaw/mc-client'
import { requireRole } from '@/lib/auth'
import { readLimiter, heavyLimiter } from '@/lib/rate-limit'
import { getOpenClawHome } from '@/lib/openclaw-home'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = readLimiter(request)
  if (limited) return limited

  const home = getOpenClawHome()
  const reg = await readCompanyRegistry(home)
  const active = await readActiveCompany(home)
  return NextResponse.json({
    ok: reg.ok,
    companies: reg.companies,
    error: reg.error,
    activeCompanyId: active.companyId,
  })
}

const bodySchema = (raw: unknown): { companyId: string } | null => {
  if (!raw || typeof raw !== 'object') return null
  const id = (raw as { companyId?: unknown }).companyId
  if (typeof id !== 'string' || !id.trim()) return null
  const companyId = id.trim().slice(0, 120)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(companyId)) return null
  return { companyId }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = heavyLimiter(request)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const parsed = bodySchema(body)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid companyId' }, { status: 400 })
  }

  const home = getOpenClawHome()
  const p = path.join(home, 'workspace', '.active-company')
  try {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, `${parsed.companyId}\n`, 'utf8')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true, activeCompanyId: parsed.companyId })
}

export const dynamic = 'force-dynamic'
