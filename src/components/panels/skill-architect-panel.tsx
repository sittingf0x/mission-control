'use client'

import { useEffect, useMemo, useState } from 'react'
import { stripAnsi } from '@/lib/strip-ansi'

type JobArtifactFile = { path: string; content: string; citations?: string[] }
type MatrixPreflight = {
  task?: string
  warning?: boolean
  suggest?: { stdout?: string; exitCode?: number }
  error?: string
}
type JobState = {
  id: string
  status: string
  error?: string
  targetAgent?: string
  targetSubagent?: string
  matrixPreflight?: MatrixPreflight
  approval?: { state: string; approver: string; note?: string; at: string }
  artifact?: {
    summary?: string
    files?: JobArtifactFile[]
    metadata?: Record<string, unknown>
  }
}

type ApplyResult = {
  backupId: string
  dryRun: boolean
  changed: Array<{ path: string; action: string; beforeBytes: number; afterBytes: number }>
}

const TERMINAL_STATES = new Set(['failed', 'approved', 'rejected'])

export function SkillArchitectPanel() {
  const [topic, setTopic] = useState('')
  const [urlsText, setUrlsText] = useState('')
  const [targetAgent, setTargetAgent] = useState('jarvis')
  const [targetSubagent, setTargetSubagent] = useState('')
  const [mode, setMode] = useState<'skill-only' | 'spec-tree' | 'mixed'>('mixed')
  const [job, setJob] = useState<JobState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [matrixOpen, setMatrixOpen] = useState(true)

  const urls = useMemo(() => urlsText.split('\n').map(s => s.trim()).filter(Boolean), [urlsText])
  const files = job?.artifact?.files || []

  useEffect(() => {
    if (!job?.id) return
    if (TERMINAL_STATES.has(job.status) || job.status === 'ready_for_review') return

    const t = setInterval(async () => {
      const res = await fetch(`/api/skill-architect/jobs/${encodeURIComponent(job.id)}`)
      const data = await res.json()
      if (res.ok) setJob(data)
    }, 2500)

    return () => clearInterval(t)
  }, [job?.id, job?.status])

  useEffect(() => {
    if (!selectedFile && files.length > 0) setSelectedFile(files[0].path)
  }, [files, selectedFile])

  async function refreshJob(id: string) {
    const refreshed = await fetch(`/api/skill-architect/jobs/${encodeURIComponent(id)}`)
    const data = await refreshed.json()
    if (refreshed.ok) setJob(data)
  }

  async function submit() {
    setError('')
    setLoading(true)
    setJob(null)
    setSelectedFile('')
    setApplyResult(null)
    try {
      const res = await fetch('/api/skill-architect/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester: 'jarvis',
          topic: topic || undefined,
          urls,
          targetAgent,
          targetSubagent: targetSubagent || undefined,
          mode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit job')
      setJob(data as JobState)
    } catch (e: any) {
      setError(e?.message || 'Failed to submit')
    } finally {
      setLoading(false)
    }
  }

  async function approveJob() {
    if (!job?.id) return
    setError('')
    const res = await fetch(`/api/skill-architect/jobs/${encodeURIComponent(job.id)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to approve')
      return
    }
    await refreshJob(job.id)
  }

  async function rejectJob() {
    if (!job?.id) return
    setError('')
    const res = await fetch(`/api/skill-architect/jobs/${encodeURIComponent(job.id)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to reject')
      return
    }
    await refreshJob(job.id)
  }

  async function applyJob(dryRun: boolean) {
    if (!job?.id) return
    setError('')
    const res = await fetch(`/api/skill-architect/jobs/${encodeURIComponent(job.id)}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Apply failed')
      return
    }
    setApplyResult(data)
  }

  const current = files.find(f => f.path === selectedFile)

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold mb-3">Skill Architect</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="border rounded px-3 py-2 bg-background" placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <input className="border rounded px-3 py-2 bg-background" placeholder="Target agent" value={targetAgent} onChange={(e) => setTargetAgent(e.target.value)} />
          <input className="border rounded px-3 py-2 bg-background" placeholder="Target subagent (optional)" value={targetSubagent} onChange={(e) => setTargetSubagent(e.target.value)} />
          <select className="border rounded px-3 py-2 bg-background" value={mode} onChange={(e) => setMode(e.target.value as 'skill-only' | 'spec-tree' | 'mixed')}>
            <option value="mixed">mixed</option>
            <option value="spec-tree">spec-tree</option>
            <option value="skill-only">skill-only</option>
          </select>
        </div>
        <textarea className="border rounded px-3 py-2 bg-background w-full mt-3 min-h-28" placeholder="URLs (one per line)" value={urlsText} onChange={(e) => setUrlsText(e.target.value)} />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50" disabled={loading || urls.length === 0} onClick={submit}>
            {loading ? 'Submitting...' : 'Generate review artifacts'}
          </button>
          {job && <span className="text-sm text-muted-foreground">Job {job.id} - {job.status}</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>

      {job && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm flex items-center gap-2 flex-wrap">
            <span className="font-medium">Status:</span> {job.status}
            {job.status === 'ready_for_review' && (
              <>
                <button className="px-2 py-1 rounded bg-green-600 text-white text-xs" onClick={approveJob}>Approve</button>
                <button className="px-2 py-1 rounded bg-red-600 text-white text-xs" onClick={rejectJob}>Reject</button>
              </>
            )}
            {job.status === 'approved' && (
              <>
                <button className="px-2 py-1 rounded bg-slate-700 text-white text-xs" onClick={() => applyJob(true)}>Dry run apply</button>
                <button className="px-2 py-1 rounded bg-blue-600 text-white text-xs" onClick={() => applyJob(false)}>Apply now</button>
              </>
            )}
          </div>
          {job.approval && (
            <div className="text-xs text-muted-foreground">
              decision: {job.approval.state} by {job.approval.approver} at {job.approval.at}
            </div>
          )}
          {job.error && <div className="text-sm text-red-500">{job.error}</div>}
          {job.matrixPreflight && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm space-y-2">
              {job.matrixPreflight.warning ? (
                <p className="text-amber-800 dark:text-amber-200 font-medium">
                  Hyperspace reports similar existing capabilities — review before approving.
                </p>
              ) : null}
              {job.matrixPreflight.error ? (
                <p className="text-xs text-muted-foreground">Matrix preflight: {job.matrixPreflight.error}</p>
              ) : null}
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => setMatrixOpen((o) => !o)}
              >
                {matrixOpen ? 'Hide' : 'Show'} similar capabilities (Matrix)
              </button>
              {matrixOpen && job.matrixPreflight.suggest?.stdout ? (
                <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-muted/40 rounded p-2 border">
                  {stripAnsi(job.matrixPreflight.suggest.stdout)}
                </pre>
              ) : null}
            </div>
          )}
          {job.artifact?.summary && <p className="text-sm text-muted-foreground">{job.artifact.summary}</p>}

          {applyResult && (
            <div className="border rounded p-3 text-xs bg-muted/30 space-y-1">
              <div><strong>{applyResult.dryRun ? 'Dry run' : 'Applied'}</strong> backupId: {applyResult.backupId}</div>
              <div>changed files: {applyResult.changed.length}</div>
              {applyResult.changed.slice(0, 8).map((c) => (
                <div key={c.path}>{c.action.toUpperCase()} {c.path} ({c.beforeBytes} {"->"} {c.afterBytes} bytes)</div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="grid md:grid-cols-[260px_1fr] gap-3">
              <div className="border rounded max-h-[420px] overflow-auto">
                {files.map((f) => (
                  <button key={f.path} className={`block w-full text-left px-3 py-2 text-sm border-b hover:bg-muted ${selectedFile === f.path ? 'bg-muted' : ''}`} onClick={() => setSelectedFile(f.path)}>
                    {f.path}
                  </button>
                ))}
              </div>
              <div className="border rounded p-3 max-h-[420px] overflow-auto">
                <div className="text-xs text-muted-foreground mb-2">{current?.path}</div>
                <pre className="text-xs whitespace-pre-wrap">{current?.content || ''}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
