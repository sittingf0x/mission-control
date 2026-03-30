import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { callSkillArchitect } from '@/lib/skill-architect-client'

const AGENTS_ROOT = '/home/ubuntu/workspace/agents'
const RUNTIME_ROOT = '/home/ubuntu/.openclaw/skill-architect'
const BACKUP_ROOT = path.join(RUNTIME_ROOT, 'backups')
const AUDIT_LOG = path.join(RUNTIME_ROOT, 'audit.log.jsonl')

export type ApplyResult = {
  ok: boolean
  dryRun: boolean
  jobId: string
  targetRoot: string
  backupId: string
  changed: Array<{ path: string; action: 'create' | 'update' | 'unchanged'; beforeBytes: number; afterBytes: number }>
}

function sanitizeRelative(p: string) {
  return p.replace(/^\/+/, '')
}

async function ensureDirs() {
  await fs.mkdir(BACKUP_ROOT, { recursive: true })
  await fs.mkdir(path.dirname(AUDIT_LOG), { recursive: true })
}

async function appendAudit(entry: Record<string, unknown>) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'
  await fs.appendFile(AUDIT_LOG, line, 'utf8')
}

async function loadJob(jobId: string): Promise<any> {
  const job = await callSkillArchitect(`/v1/jobs/${encodeURIComponent(jobId)}`)
  return job
}

function resolveTargetRoot(targetAgent: string): string {
  const root = path.resolve(path.join(AGENTS_ROOT, targetAgent))
  const allowedRoot = path.resolve(AGENTS_ROOT)
  if (!root.startsWith(allowedRoot + path.sep) && root !== allowedRoot) {
    throw new Error('target root outside allowlist')
  }
  return root
}

async function safeRead(filePath: string): Promise<string | null> {
  try { return await fs.readFile(filePath, 'utf8') } catch { return null }
}

async function atomicWrite(filePath: string, content: string) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, filePath)
}

export async function applySkillJob(params: { jobId: string; dryRun: boolean; requestedBy: string }): Promise<ApplyResult> {
  await ensureDirs()
  const job = await loadJob(params.jobId)
  if (job.status !== 'approved') {
    throw new Error(`job status must be approved, got ${job.status}`)
  }

  const targetAgent = String(job.targetAgent || job.artifact?.metadata?.targetAgent || '').trim()
  if (!targetAgent) throw new Error('missing targetAgent')

  const files = Array.isArray(job.artifact?.files) ? job.artifact.files : []
  if (!files.length) throw new Error('artifact has no files')

  const targetRoot = resolveTargetRoot(targetAgent)
  const backupId = `${params.jobId}-${Date.now()}`
  const backupDir = path.join(BACKUP_ROOT, backupId)
  await fs.mkdir(backupDir, { recursive: true })

  const changed: ApplyResult['changed'] = []

  for (const f of files) {
    const rel = sanitizeRelative(String(f.path || ''))
    if (!/^(SKILLS\.md|skills\/.+\.md|specs\/.+\.md|playbooks\/.+\.md)$/.test(rel)) continue

    const dest = path.resolve(path.join(targetRoot, rel))
    if (!dest.startsWith(targetRoot + path.sep) && dest !== targetRoot) {
      throw new Error(`file path escapes target root: ${rel}`)
    }

    const before = await safeRead(dest)
    const after = String(f.content || '')
    const action: 'create' | 'update' | 'unchanged' = before === null ? 'create' : (before === after ? 'unchanged' : 'update')

    changed.push({
      path: rel,
      action,
      beforeBytes: before?.length || 0,
      afterBytes: after.length,
    })

    if (before !== null) {
      const backupPath = path.join(backupDir, rel)
      await fs.mkdir(path.dirname(backupPath), { recursive: true })
      await fs.writeFile(backupPath, before, 'utf8')
    }

    if (!params.dryRun && action !== 'unchanged') {
      await atomicWrite(dest, after)
    }
  }

  await appendAudit({
    event: params.dryRun ? 'apply.dry_run' : 'apply.executed',
    jobId: params.jobId,
    targetRoot,
    backupId,
    requestedBy: params.requestedBy,
    changed,
  })

  return {
    ok: true,
    dryRun: params.dryRun,
    jobId: params.jobId,
    targetRoot,
    backupId,
    changed,
  }
}

export async function rollbackSkillJob(params: { targetAgent: string; backupId: string; requestedBy: string }) {
  await ensureDirs()
  const targetRoot = resolveTargetRoot(params.targetAgent)
  const backupDir = path.join(BACKUP_ROOT, params.backupId)
  const exists = await fs.stat(backupDir).then(() => true).catch(() => false)
  if (!exists) throw new Error('backup not found')

  const restored: string[] = []

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      const rel = path.relative(backupDir, abs)
      if (e.isDirectory()) {
        await walk(abs)
        continue
      }
      const dest = path.resolve(path.join(targetRoot, rel))
      if (!dest.startsWith(targetRoot + path.sep) && dest !== targetRoot) continue
      const content = await fs.readFile(abs, 'utf8')
      await atomicWrite(dest, content)
      restored.push(rel)
    }
  }

  await walk(backupDir)

  await appendAudit({
    event: 'apply.rollback',
    backupId: params.backupId,
    targetRoot,
    requestedBy: params.requestedBy,
    restored,
  })

  return { ok: true, backupId: params.backupId, restored }
}
