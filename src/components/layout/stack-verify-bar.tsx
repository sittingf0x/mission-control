'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'

type StackVerifyStep = {
  name: string
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

type StackVerifyGatewayHealth = {
  ok: boolean
  url: string
  status?: number
  error?: string
}

type StackVerifyResult = {
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

const STORAGE_KEY = 'mc-stack-verify-last'

export function StackVerifyBar() {
  const { dashboardMode } = useMissionControl()
  const isLocal = dashboardMode === 'local'
  const [config, setConfig] = useState<{ configured: boolean; repoPath: string | null; openclawHome: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [withServices, setWithServices] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StackVerifyResult | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/stack-verify', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setConfig({
        configured: Boolean(data.configured),
        repoPath: data.repoPath ?? null,
        openclawHome: String(data.openclawHome || ''),
      })
    } catch {
      setConfig(null)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as StackVerifyResult
        if (parsed && typeof parsed.at === 'number') setResult(parsed)
      }
    } catch {
      /* ignore */
    }
  }, [loadConfig])

  const runVerify = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/openclaw/stack-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withServices }),
      })
      const data = (await res.json()) as StackVerifyResult
      setResult(data)
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        /* ignore */
      }
      void loadConfig()
    } catch {
      setResult({
        ok: false,
        configured: false,
        repoPath: null,
        openclawHome: '',
        error: 'Network error — could not reach Mission Control.',
        steps: [],
        at: Date.now(),
      })
    } finally {
      setLoading(false)
    }
  }

  const lastOk = result?.ok
  const dotClass =
    result == null
      ? 'bg-muted-foreground/40'
      : lastOk
        ? 'bg-green-500'
        : 'bg-red-500'

  if (isLocal) {
    return null
  }

  return (
    <>
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs border border-border bg-secondary/40 hover:bg-secondary/60 transition-colors"
          title="Fleet sync, workspace paths, optional gateway /health — same as npm run verify:stack in OpenClaw"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden />
          <span className="font-medium text-foreground">Stack verify</span>
          {config && !config.configured && (
            <span className="text-amber-400/90" title="Set OPENCLAW_REPO on the server">
              · setup
            </span>
          )}
        </button>
      </div>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9998] isolate flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stack-verify-title"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[min(90vh,36rem)] flex flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
              <div>
                <h2 id="stack-verify-title" className="text-sm font-semibold text-foreground">
                  Operational stack verify
                </h2>
                <p className="text-2xs text-muted-foreground mt-1">
                  Same checks as{' '}
                  <code className="text-2xs bg-muted px-1 rounded">npm run validate</code> and{' '}
                  <code className="text-2xs bg-muted px-1 rounded">npm run verify:stack</code> in the OpenClaw repo, using{' '}
                  <code className="text-2xs bg-muted px-1 rounded">OPENCLAW_HOME</code> from Mission Control config.
                </p>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} title="Close">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </Button>
            </div>

            <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
              {config && (
                <div className="text-2xs text-muted-foreground space-y-1 font-mono break-all">
                  <div>
                    <span className="text-muted-foreground/80">OPENCLAW_HOME: </span>
                    {config.openclawHome || '(unset)'}
                  </div>
                  {config.repoPath && (
                    <div>
                      <span className="text-muted-foreground/80">Repo: </span>
                      {config.repoPath}
                    </div>
                  )}
                </div>
              )}

              {!config?.configured && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Mount or set <code className="text-2xs">OPENCLAW_REPO</code> to your OpenClaw clone (the tree that contains{' '}
                  <code className="text-2xs">scripts/validate-fleet-sync.js</code>), then restart the Mission Control container.
                </div>
              )}

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withServices}
                  onChange={(e) => setWithServices(e.target.checked)}
                  className="rounded border-border"
                />
                Include gateway HTTP <code className="text-2xs bg-muted px-1 rounded">/health</code> (
                <code className="text-2xs bg-muted px-1 rounded">verify:stack --with-services</code>)
              </label>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => void runVerify()} disabled={loading || !config?.configured}>
                  {loading ? 'Running…' : 'Run verify'}
                </Button>
                {!config?.configured && (
                  <span className="text-2xs text-muted-foreground self-center">Configure repo to enable</span>
                )}
              </div>

              {result?.skipReason && (
                <p className="text-xs text-amber-200/90">{result.skipReason}</p>
              )}
              {result?.error && (
                <p className="text-xs text-red-300">{result.error}</p>
              )}

              {result && result.steps.length > 0 && (
                <div className="space-y-2">
                  {result.steps.map((step) => (
                    <div
                      key={step.name}
                      className={`rounded-md border px-3 py-2 text-xs ${
                        step.ok ? 'border-green-500/25 bg-green-500/5' : 'border-red-500/25 bg-red-500/5'
                      }`}
                    >
                      <div className="font-medium text-foreground flex items-center gap-2">
                        <span className={step.ok ? 'text-green-400' : 'text-red-400'}>{step.ok ? '✓' : '✗'}</span>
                        {step.name}
                        {step.code != null && (
                          <span className="text-2xs text-muted-foreground font-mono">exit {step.code}</span>
                        )}
                      </div>
                      {(step.stdout || step.stderr) && (
                        <pre className="mt-2 text-2xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {[step.stdout, step.stderr].filter(Boolean).join('\n')}
                        </pre>
                      )}
                    </div>
                  ))}

                  {result.gatewayHealth && (
                    <div
                      className={`rounded-md border px-3 py-2 text-xs ${
                        result.gatewayHealth.ok ? 'border-green-500/25 bg-green-500/5' : 'border-red-500/25 bg-red-500/5'
                      }`}
                    >
                      <div className="font-medium text-foreground flex items-center gap-2">
                        <span className={result.gatewayHealth.ok ? 'text-green-400' : 'text-red-400'}>
                          {result.gatewayHealth.ok ? '✓' : '✗'}
                        </span>
                        Gateway /health
                        {result.gatewayHealth.status != null && (
                          <span className="text-2xs text-muted-foreground font-mono">HTTP {result.gatewayHealth.status}</span>
                        )}
                      </div>
                      <div className="text-2xs text-muted-foreground font-mono mt-1 break-all">{result.gatewayHealth.url}</div>
                      {result.gatewayHealth.error && (
                        <pre className="mt-2 text-2xs text-red-300/90 whitespace-pre-wrap">{result.gatewayHealth.error}</pre>
                      )}
                    </div>
                  )}

                  <div
                    className={`text-xs font-medium ${result.ok ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {result.ok ? 'verify:stack — OK' : 'verify:stack — FAILED'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
