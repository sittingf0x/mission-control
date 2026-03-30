/**
 * Derive common GitHub PR sub-URLs for review (no iframe; links only).
 */
export type GitHubPrLinks = {
  pr: string
  files: string
  commits: string
  checks: string
}

export function parseGitHubPrUrl(url: string): GitHubPrLinks | null {
  const s = url.trim()
  const m = s.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/[^?#]*)?/i,
  )
  if (!m) return null
  const [, owner, repo, num] = m
  const base = `https://github.com/${owner}/${repo}/pull/${num}`
  return {
    pr: base,
    files: `${base}/files`,
    commits: `${base}/commits`,
    checks: `${base}/checks`,
  }
}
