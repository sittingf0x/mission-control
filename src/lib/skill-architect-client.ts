export type SkillArchitectJobRequest = {
  requester: string
  topic?: string
  urls: string[]
  targetAgent: string
  targetSubagent?: string
  mode?: 'skill-only' | 'spec-tree' | 'mixed'
}

export async function callSkillArchitect(path: string, init: RequestInit = {}) {
  const base = process.env.MC_SKILL_ARCH_URL || 'http://172.31.40.35:18990'
  const token = process.env.MC_SKILL_ARCH_TOKEN || ''
  if (!token) throw new Error('MC_SKILL_ARCH_TOKEN not configured')

  const headers = new Headers(init.headers || {})
  headers.set('x-sa-token', token)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
  const txt = await res.text()
  let json: any = null
  try { json = txt ? JSON.parse(txt) : null } catch { json = { raw: txt } }
  if (!res.ok) {
    const msg = json?.error || `Skill Architect request failed (${res.status})`
    throw new Error(msg)
  }
  return json
}
