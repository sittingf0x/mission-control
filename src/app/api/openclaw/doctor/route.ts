import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { runOpenClaw } from '@/lib/command'
import { config } from '@/lib/config'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { archiveOrphanTranscriptsForStateDir } from '@/lib/openclaw-doctor-fix'
import { parseOpenClawDoctorOutput, type OpenClawDoctorCategory, type OpenClawDoctorStatus } from '@/lib/openclaw-doctor'

function getCommandDetail(error: unknown): { detail: string; code: number | null } {
  const err = error as {
    stdout?: string
    stderr?: string
    message?: string
    code?: number | null
  }

  const stdioDetail = [err?.stdout, err?.stderr].filter(Boolean).join('\n').trim()
  return {
    detail: stdioDetail || String(err?.message || '').trim(),
    code: typeof err?.code === 'number' ? err.code : null,
  }
}

function isMissingOpenClaw(detail: string): boolean {
  return /enoent|not installed|not reachable|command not found/i.test(detail)
}

function isBannerOnlyDoctorOutput(raw: string): boolean {
  const text = raw.replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!text) return true
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return lines.length <= 8 && lines.some(line => /openclaw doctor/i.test(line))
}

function collectReferencedTranscriptNames(store: Record<string, unknown>): Set<string> {
  const referenced = new Set<string>()

  for (const entry of Object.values(store)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>

    if (typeof record.sessionId === 'string' && record.sessionId.trim()) {
      referenced.add(`${record.sessionId.trim()}.jsonl`)
    }

    if (typeof record.sessionFile === 'string' && record.sessionFile.trim()) {
      const base = path.basename(record.sessionFile.trim())
      if (base.endsWith('.jsonl')) referenced.add(base)
    }
  }

  return referenced
}

function detectFallbackCategory(issues: string[]): OpenClawDoctorCategory {
  const text = issues.join('\n').toLowerCase()
  if (/plugin|gateway\.mode|invalid config|config/.test(text)) return 'config'
  if (/orphan transcript|missing transcript|session/.test(text)) return 'state'
  if (/allowlist|security|telegram/.test(text)) return 'security'
  return 'general'
}

function buildFallbackDoctorStatus(rawOutput: string): OpenClawDoctorStatus {
  const issues: string[] = []
  const stateDir = config.openclawStateDir
  const configPath = config.openclawConfigPath
  let cfg: Record<string, any> = {}

  if (!fs.existsSync(configPath)) {
    issues.push(`Missing config file: ${configPath}`)
  } else {
    try {
      cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, any>
    } catch (error) {
      issues.push(`Invalid config file: ${configPath} (${String(error)})`)
    }
  }

  const gatewayMode = cfg?.gateway?.mode
  if (!gatewayMode) {
    issues.push('gateway.mode is unset; gateway start will be blocked.')
  }

  const telegram = cfg?.channels?.telegram ?? {}
  if (
    telegram?.groupPolicy === 'allowlist' &&
    (!Array.isArray(telegram?.groupAllowFrom) || telegram.groupAllowFrom.length === 0) &&
    (!Array.isArray(telegram?.allowFrom) || telegram.allowFrom.length === 0)
  ) {
    issues.push('channels.telegram.groupPolicy is "allowlist" but groupAllowFrom (and allowFrom) is empty — all group messages will be silently dropped.')
  }

  const extensionsDir = path.join(stateDir, 'extensions')
  for (const pluginName of (cfg?.plugins?.allow ?? []) as string[]) {
    if (pluginName === 'telegram') continue
    const pluginManifest = path.join(extensionsDir, pluginName, 'openclaw.plugin.json')
    if (!fs.existsSync(pluginManifest)) {
      issues.push(`plugins.allow: plugin not found: ${pluginName}`)
    }
  }

  const agentsDir = path.join(stateDir, 'agents')
  if (fs.existsSync(agentsDir)) {
    for (const agentName of fs.readdirSync(agentsDir)) {
      const sessionsDir = path.join(agentsDir, agentName, 'sessions')
      const sessionsFile = path.join(sessionsDir, 'sessions.json')
      if (!fs.existsSync(sessionsFile)) continue

      try {
        const store = JSON.parse(fs.readFileSync(sessionsFile, 'utf8')) as Record<string, unknown>
        const referenced = collectReferencedTranscriptNames(store)
        let orphanCount = 0
        let missingCount = 0

        for (const transcript of referenced) {
          if (!fs.existsSync(path.join(sessionsDir, transcript))) missingCount += 1
        }

        for (const entry of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl') || entry.name === 'sessions.json') continue
          if (!referenced.has(entry.name)) orphanCount += 1
        }

        if (missingCount > 0) {
          issues.push(`${agentName}: ${missingCount} referenced session transcript file(s) are missing.`)
        }
        if (orphanCount > 0) {
          issues.push(`${agentName}: found ${orphanCount} orphan transcript file(s) in sessions.`)
        }
      } catch (error) {
        issues.push(`${agentName}: failed to read session store (${String(error)})`)
      }
    }
  }

  const level = issues.length > 0 ? 'warning' : 'healthy'
  const summary = issues[0] || 'OpenClaw doctor reports a healthy configuration.'
  const category = detectFallbackCategory(issues)
  const raw = [
    'OpenClaw doctor output was truncated in the non-interactive Mission Control runtime.',
    'Mission Control fell back to direct filesystem/config diagnostics.',
    rawOutput.trim(),
    ...issues.map(issue => `- ${issue}`),
  ].filter(Boolean).join('\n')

  return {
    level,
    category,
    healthy: level === 'healthy',
    summary,
    issues,
    canFix: true,
    raw,
  }
}

function resolveDoctorStatus(rawOutput: string, exitCode: number | null): OpenClawDoctorStatus {
  const parsed = parseOpenClawDoctorOutput(rawOutput, exitCode ?? 0, {
    stateDir: config.openclawStateDir,
  })

  if (!isBannerOnlyDoctorOutput(parsed.raw)) return parsed
  return buildFallbackDoctorStatus(rawOutput)
}

export async function GET(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const result = await runOpenClaw(['doctor'], { timeoutMs: 15000, allowNonZeroExit: true })
    return NextResponse.json(resolveDoctorStatus((result.stdout || '') + '\n' + (result.stderr || ''), result.code ?? 0), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const info = getCommandDetail(error)
    if (isMissingOpenClaw(info.detail)) {
      return NextResponse.json({ error: 'OpenClaw is not installed or not reachable' }, { status: 400 })
    }

    return NextResponse.json(resolveDoctorStatus(info.detail, info.code ?? 1), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const progress: Array<{ step: string; detail: string }> = []

    const fixResult = await runOpenClaw(['doctor', '--fix'], { timeoutMs: 120000 })
    progress.push({ step: 'doctor', detail: 'Applied OpenClaw doctor config fixes.' })

    try {
      await runOpenClaw(['sessions', 'cleanup', '--all-agents', '--enforce', '--fix-missing'], { timeoutMs: 120000 })
      progress.push({ step: 'sessions', detail: 'Pruned missing transcript entries from session stores.' })
    } catch (error) {
      const info = getCommandDetail(error)
      progress.push({ step: 'sessions', detail: info.detail || 'Session cleanup skipped.' })
    }

    const orphanFix = archiveOrphanTranscriptsForStateDir(config.openclawStateDir)
    progress.push({
      step: 'orphans',
      detail:
        orphanFix.archivedOrphans > 0
          ? ('Archived ' + orphanFix.archivedOrphans + ' orphan transcript file(s) across ' + orphanFix.storesScanned + ' session store(s).')
          : ('No orphan transcript files found across ' + orphanFix.storesScanned + ' session store(s).'),
    })

    const postFix = await runOpenClaw(['doctor'], { timeoutMs: 15000, allowNonZeroExit: true })
    const status = resolveDoctorStatus((postFix.stdout || '') + '\n' + (postFix.stderr || ''), postFix.code ?? 0)

    try {
      const db = getDatabase()
      db.prepare('INSERT INTO audit_log (action, actor, detail) VALUES (?, ?, ?)').run(
        'openclaw.doctor.fix',
        auth.user.username,
        JSON.stringify({ level: status.level, healthy: status.healthy, issues: status.issues })
      )
    } catch {
      // Non-critical.
    }

    return NextResponse.json({
      success: true,
      output: ((fixResult.stdout || '') + '\n' + (fixResult.stderr || '')).trim(),
      progress,
      status,
    })
  } catch (error) {
    const info = getCommandDetail(error)
    if (isMissingOpenClaw(info.detail)) {
      return NextResponse.json({ error: 'OpenClaw is not installed or not reachable' }, { status: 400 })
    }

    const parsed = resolveDoctorStatus(info.detail, info.code ?? 1)

    if (parsed.level !== 'error') {
      return NextResponse.json({
        success: true,
        warning: true,
        output: info.detail,
        progress: [{ step: 'doctor', detail: 'Doctor completed with warnings.' }],
        status: parsed,
      })
    }

    logger.error({ err: error }, 'OpenClaw doctor fix failed')

    return NextResponse.json(
      {
        error: 'OpenClaw doctor fix failed',
        detail: info.detail,
        status: parsed,
      },
      { status: 500 }
    )
  }
}
