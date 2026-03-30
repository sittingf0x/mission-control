export async function callSkillApply(path: string, init: RequestInit = {}) {
  const base = process.env.MC_SKILL_APPLY_URL || 'http://172.17.0.1:19010'
  const token = process.env.MC_SKILL_APPLY_TOKEN || ''
  if (!token) throw new Error('MC_SKILL_APPLY_TOKEN not configured')

  const headers = new Headers(init.headers || {})
  headers.set('x-apply-token', token)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')

  const r = await fetch(`${base}${path}`, { ...init, headers, cache: 'no-store' })
  const txt = await r.text()
  const j = txt ? JSON.parse(txt) : {}
  if (!r.ok) throw new Error(j?.error || `apply worker failed (${r.status})`)
  return j
}
