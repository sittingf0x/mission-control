import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getStackVerifyConfig, runOperationalStackVerify } from '@/lib/stack-verify'

/**
 * GET — whether stack verify scripts are available (no execution).
 * POST — run validate-fleet-sync + validate-workspace-paths; optional gateway /health (same as npm run verify:stack).
 */
export async function GET(request: Request) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const cfg = getStackVerifyConfig()
  return NextResponse.json(cfg, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let withServices = true
  try {
    const body = (await request.json()) as { withServices?: boolean }
    if (body && typeof body.withServices === 'boolean') {
      withServices = body.withServices
    }
  } catch {
    /* default */
  }

  const result = await runOperationalStackVerify({ withServices })
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
