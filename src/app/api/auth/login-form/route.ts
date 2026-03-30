import { NextResponse } from 'next/server'
import { authenticateUser, createSession } from '@/lib/auth'
import { logAuditEvent } from '@/lib/db'
import { getMcSessionCookieName, getMcSessionCookieOptions, isRequestSecure } from '@/lib/session-cookie'

function redirect(path: string) {
  // Use relative redirects so proxy/internal hostnames never leak to browsers.
  return new NextResponse(null, { status: 303, headers: { Location: path } })
}

export async function POST(request: Request) {
  const form = await request.formData()
  const username = String(form.get('username') || '').trim()
  const password = String(form.get('password') || '')

  if (!username || !password) {
    return redirect('/login?error=missing')
  }

  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
  const userAgent = request.headers.get('user-agent') || undefined

  const user = authenticateUser(username, password)
  if (!user) {
    logAuditEvent({ action: 'login_failed', actor: username, ip_address: ipAddress, user_agent: userAgent })
    return redirect('/login?error=invalid')
  }

  const { token, expiresAt } = createSession(user.id, ipAddress, userAgent, user.workspace_id)
  logAuditEvent({ action: 'login', actor: user.username, actor_id: user.id, ip_address: ipAddress, user_agent: userAgent })

  const response = redirect('/')
  const isSecureRequest = isRequestSecure(request)
  const cookieName = getMcSessionCookieName(isSecureRequest)

  response.cookies.set(cookieName, token, {
    ...getMcSessionCookieOptions({ maxAgeSeconds: expiresAt - Math.floor(Date.now() / 1000), isSecureRequest }),
  })

  return response
}
