/** Strip ANSI escapes (Matrix CLI stdout) — same regex as @openclaw/mc-client */
export function stripAnsi(s: string): string {
  if (!s || typeof s !== 'string') return ''
  return s.replace(/\u001b\[[0-9;]*m/g, '')
}
