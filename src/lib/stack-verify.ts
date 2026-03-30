import fs from 'node:fs'
import path from 'node:path'
import { runCommand } from '@/lib/command'
import { config } from '@/lib/config'
import { checkGatewayHealth } from '@openclaw/mc-client'

export type StackVerifyStep = {
  name: string
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

export type StackVerifyGatewayHealth = {
  ok: boolean
  url: string
  status?: number
  error?: string
}

export type StackVerifyResult = {
  ok: boolean
  configured: boolean
  repoPath: string | null
  openclawHome: string
  skipReason?: string
  steps: StackVerifyStep[]
  gatewayHealth?: StackVerifyGatewayHealth
  error?: string
  at: number
}

function normalizeGatewayLoopbackHost(host: string): string {
  if (host === 'localhost' || host === '::1') return '127.0.0.1'
  return host
}

/**
 * Resolve OpenClaw git clone containing scripts/validate-fleet-sync.js.
 * Set OPENCLAW_REPO or MISSION_CONTROL_OPENCLAW_REPO in MC env (e.g. /home/ubuntu/openclaw-repo).
 */
export function resolveOpenClawRepo(): string | null {
  const candidates = [
    process.env.OPENCLAW_REPO,
    process.env.MISSION_CONTROL_OPENCLAW_REPO,
    '/openclaw-repo',
    path.join('/home', 'ubuntu', 'openclaw-repo'),
  ].filter((c): c is string => Boolean(c && String(c).trim()))

  const seen = new Set<string>()
  for (const c of candidates) {
    const p = path.resolve(c.trim())
    if (seen.has(p)) continue
    seen.add(p)
    const script = path.join(p, 'scripts', 'validate-fleet-sync.js')
    if (fs.existsSync(script)) return p
  }
  return null
}

export function getStackVerifyConfig(): {
  configured: boolean
  repoPath: string | null
  openclawHome: string
} {
  const repo = resolveOpenClawRepo()
  return {
    configured: repo !== null,
    repoPath: repo,
    openclawHome: config.openclawStateDir,
  }
}

export async function runOperationalStackVerify(opts: {
  withServices: boolean
}): Promise<StackVerifyResult> {
  const at = Date.now()
  const openclawHome = config.openclawStateDir
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCLAW_HOME: openclawHome || process.env.HOME || '',
  }

  const repo = resolveOpenClawRepo()
  if (!repo) {
    return {
      ok: false,
      configured: false,
      repoPath: null,
      openclawHome,
      skipReason:
        'OpenClaw repo not found on this host. Set OPENCLAW_REPO (or MISSION_CONTROL_OPENCLAW_REPO) to the clone that contains scripts/ (e.g. ~/openclaw-repo on EC2), then restart Mission Control.',
      steps: [],
      at,
    }
  }

  const fleetScript = path.join(repo, 'scripts', 'validate-fleet-sync.js')
  const wsScript = path.join(repo, 'scripts', 'validate-workspace-paths.mjs')
  const steps: StackVerifyStep[] = []

  try {
    const fleet = await runCommand(process.execPath, [fleetScript], {
      env,
      timeoutMs: 60_000,
      allowNonZeroExit: true,
    })
    steps.push({
      name: 'validate-fleet-sync',
      ok: fleet.code === 0,
      stdout: fleet.stdout,
      stderr: fleet.stderr,
      code: fleet.code,
    })

    const ws = await runCommand(process.execPath, [wsScript], {
      env,
      timeoutMs: 60_000,
      allowNonZeroExit: true,
    })
    steps.push({
      name: 'validate-workspace-paths',
      ok: ws.code === 0,
      stdout: ws.stdout,
      stderr: ws.stderr,
      code: ws.code,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      configured: true,
      repoPath: repo,
      openclawHome,
      steps,
      error: msg,
      at,
    }
  }

  let gatewayHealth: StackVerifyGatewayHealth | undefined
  if (opts.withServices) {
    const host = normalizeGatewayLoopbackHost(config.gatewayHost)
    const port = config.gatewayPort
    const baseUrl = `http://${host}:${port}`
    const r = await checkGatewayHealth(baseUrl, { retries: 2, timeout: 5000 })
    gatewayHealth = {
      ok: r.ok === true,
      url: `${baseUrl}/health`,
      status: r.status,
      error: typeof r.error === 'string' ? r.error : undefined,
    }
  }

  const stepsOk = steps.every((s) => s.ok)
  const gatewayOk = !opts.withServices || gatewayHealth?.ok === true
  const ok = stepsOk && gatewayOk

  return {
    ok,
    configured: true,
    repoPath: repo,
    openclawHome,
    steps,
    gatewayHealth,
    at,
  }
}
