'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { RuntimeSetupModal } from './runtime-setup-modal'

const HERMES_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', hermesId: 'anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'], env: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI (API Key)', hermesId: 'openai', models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini', 'codex-mini-latest', 'gpt-5.3-codex'], env: 'OPENAI_API_KEY' },
  { id: 'openai_oauth', label: 'OpenAI (OAuth)', hermesId: 'openai', models: ['gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini', 'codex-mini-latest', 'gpt-5.3-codex'], env: 'OPENAI_API_KEY' },
  { id: 'openrouter', label: 'OpenRouter', hermesId: 'openrouter', models: ['anthropic/claude-sonnet-4-6', 'openai/gpt-4.1'], env: 'OPENROUTER_API_KEY' },
  { id: 'google', label: 'Google AI', hermesId: 'google', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], env: 'GOOGLE_API_KEY' },
  { id: 'nous', label: 'Nous Portal', hermesId: 'nous', models: ['hermes-3-llama-3.1-70b'], env: 'NOUS_API_KEY' },
  { id: 'xai', label: 'xAI', hermesId: 'xai', models: ['grok-3', 'grok-3-mini'], env: 'XAI_API_KEY' },
]

interface RuntimeStatus {
  id: string
  name: string
  description: string
  installed: boolean
  version: string | null
  running: boolean
  authRequired: boolean
  authHint: string
  authenticated: boolean
}

interface InstallJob {
  id: string
  runtime: string
  status: 'pending' | 'running' | 'success' | 'failed'
  output: string
  error: string | null
}

interface Props {
  isGateway: boolean
  onNext: () => void
  onBack: () => void
}

function modeColors(isGateway: boolean) {
  return isGateway
    ? { text: 'text-void-cyan', border: 'border-void-cyan/30', bgBtn: 'bg-void-cyan/20', hoverBg: 'hover:bg-void-cyan/30' }
    : { text: 'text-void-amber', border: 'border-void-amber/30', bgBtn: 'bg-void-amber/20', hoverBg: 'hover:bg-void-amber/30' }
}

export function StepAgentRuntimes({ isGateway, onNext, onBack }: Props) {
  const mc = modeColors(isGateway)
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([])
  const [isDocker, setIsDocker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeJobs, setActiveJobs] = useState<Record<string, InstallJob>>({})
  const [copiedYaml, setCopiedYaml] = useState<string | null>(null)
  const [setupRuntime, setSetupRuntime] = useState<'openclaw' | 'hermes' | null>(null)
  const [setupCompleted, setSetupCompleted] = useState<Set<string>>(new Set())
  const [hermesProvider, setHermesProvider] = useState('anthropic')
  const [hermesModel, setHermesModel] = useState('claude-sonnet-4-6')
  const [hermesApiKey, setHermesApiKey] = useState('')
  const [hermesConfigSaved, setHermesConfigSaved] = useState(false)
  const [hermesConfigBusy, setHermesConfigBusy] = useState(false)
  const [hermesOAuthBusy, setHermesOAuthBusy] = useState(false)
  const [hermesOAuthOutput, setHermesOAuthOutput] = useState<string | null>(null)
  const [hermesOAuthError, setHermesOAuthError] = useState<string | null>(null)
  const [hermesMigrating, setHermesMigrating] = useState(false)
  const [hermesMigrateResult, setHermesMigrateResult] = useState<string | null>(null)

  const fetchRuntimes = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-runtimes')
      if (!res.ok) return
      const data = await res.json()
      setRuntimes(data.runtimes || [])
      setIsDocker(data.isDocker || false)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRuntimes() }, [fetchRuntimes])

  // Poll active jobs
  useEffect(() => {
    const running = Object.values(activeJobs).filter(j => j.status === 'running' || j.status === 'pending')
    if (running.length === 0) return

    const interval = setInterval(async () => {
      for (const job of running) {
        try {
          const res = await fetch('/api/agent-runtimes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'job-status', jobId: job.id }),
          })
          if (!res.ok) continue
          const data = await res.json()
          if (data.job) {
            setActiveJobs(prev => ({ ...prev, [data.job.runtime]: data.job }))
            if (data.job.status === 'success' || data.job.status === 'failed') {
              fetchRuntimes()
            }
          }
        } catch {
          // ignore
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [activeJobs, fetchRuntimes])

  const handleInstall = async (runtimeId: string) => {
    try {
      const res = await fetch('/api/agent-runtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', runtime: runtimeId, mode: 'local' }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.job) {
        setActiveJobs(prev => ({ ...prev, [runtimeId]: data.job }))
      }
    } catch {
      // ignore
    }
  }

  const handleCopyCompose = async (runtimeId: string) => {
    try {
      const res = await fetch('/api/agent-runtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'docker-compose', runtime: runtimeId }),
      })
      if (!res.ok) return
      const data = await res.json()
      await navigator.clipboard.writeText(data.yaml)
      setCopiedYaml(runtimeId)
      setTimeout(() => setCopiedYaml(null), 2000)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <>
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-border/30">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
          <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>Continue</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-1">Agent Runtimes</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Install agent runtimes to run AI agents. You can skip this and install later from Settings.
        </p>

        {isDocker && (
          <div className="mb-3 p-2.5 rounded-lg border border-void-cyan/20 bg-void-cyan/5 text-xs text-muted-foreground">
            Running in Docker — install directly or use sidecar services for production.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {runtimes.map((rt) => {
            const job = activeJobs[rt.id]
            const isInstalling = job?.status === 'running' || job?.status === 'pending'
            const installFailed = job?.status === 'failed'
            const justInstalled = job?.status === 'success'

            return (
              <div
                key={rt.id}
                className={`relative rounded-lg border text-left transition-all overflow-hidden ${
                  isInstalling
                    ? 'border-primary/30 bg-primary/5'
                    : rt.installed || justInstalled
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border/30 bg-surface-1/30'
                }`}
              >
                {/* Installing shimmer overlay */}
                {isInstalling && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent animate-[shimmer_2s_infinite]" style={{ backgroundSize: '200% 100%' }} />
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/20 overflow-hidden">
                      <div className="h-full bg-emerald-500/60 animate-[indeterminate_1.5s_infinite_ease-in-out]" />
                    </div>
                  </div>
                )}

                <div className="relative p-4">
                  {/* Status badge */}
                  {(rt.installed || justInstalled) && !isInstalling && (
                    <span className="absolute -top-0.5 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Detected
                    </span>
                  )}

                  {isInstalling ? (
                    /* Full-card installing state with live output */
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                            {rt.name.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{rt.name}</p>
                          <p className="text-2xs text-emerald-400/70">Installing...</p>
                        </div>
                      </div>
                      {/* Live output tail */}
                      {job?.output && (
                        <div className="bg-black/30 rounded px-2 py-1.5 max-h-20 overflow-y-auto">
                          <pre className="font-mono text-[10px] text-muted-foreground/60 whitespace-pre-wrap break-all leading-relaxed">
                            {job.output.trim().split('\n').slice(-6).join('\n')}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className={`text-sm font-medium mb-1 ${rt.installed || justInstalled ? 'text-emerald-400' : 'text-foreground'}`}>
                        {rt.name}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">{rt.description}</p>

                      {rt.version && (
                        <p className="text-2xs text-muted-foreground/60 mb-1">v{rt.version}</p>
                      )}

                      {/* Auth status */}
                      {rt.installed && rt.authRequired && (
                        <p className={`text-2xs mb-1 ${rt.authenticated ? 'text-emerald-400/70' : 'text-amber-400'}`}>
                          {rt.authenticated ? 'Authenticated' : rt.authHint}
                        </p>
                      )}

                      {/* Hermes inline quick config */}
                      {rt.id === 'hermes' && (rt.installed || justInstalled) && !hermesConfigSaved && (
                        <div className="mt-2 p-2.5 rounded-lg border border-border/20 bg-black/10 space-y-2">
                          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Quick Setup</p>

                          {/* Provider + Model dropdowns */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={hermesProvider}
                              onChange={(e) => {
                                const p = HERMES_PROVIDERS.find(pr => pr.id === e.target.value)
                                setHermesProvider(e.target.value)
                                setHermesModel(p?.models[0] || '')
                                setHermesOAuthOutput(null)
                                setHermesOAuthError(null)
                              }}
                              className="h-7 rounded border border-border/20 bg-card px-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                            >
                              {HERMES_PROVIDERS.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                            <select
                              value={hermesModel}
                              onChange={(e) => setHermesModel(e.target.value)}
                              className="h-7 rounded border border-border/20 bg-card px-1.5 text-[10px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
                            >
                              {(HERMES_PROVIDERS.find(p => p.id === hermesProvider)?.models || []).map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>

                          {/* API Key or OAuth */}
                          {hermesProvider === 'openai_oauth' ? (
                            <div className="p-2 rounded border border-border/15 bg-black/10 text-[10px] text-muted-foreground/60 space-y-1.5">
                              <p>OAuth uses device code flow:</p>
                              <div className="flex items-center gap-1.5 bg-black/20 rounded px-2 py-1 font-mono text-[10px]">
                                <span className="text-muted-foreground/50">$</span>
                                <span className="flex-1 text-foreground/80">hermes model</span>
                                <button
                                  type="button"
                                  disabled={hermesOAuthBusy}
                                  onClick={async () => {
                                    setHermesOAuthBusy(true)
                                    setHermesOAuthOutput(null)
                                    setHermesOAuthError(null)
                                    try {
                                      const res = await fetch('/api/hermes', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'run-oauth-model', model: hermesModel }),
                                      })
                                      const data = await res.json()
                                      if (res.ok && data.success) {
                                        setHermesOAuthOutput(data.output || 'Done')
                                      } else {
                                        setHermesOAuthError(data.error || 'OAuth command failed')
                                        if (data.output) setHermesOAuthOutput(data.output)
                                      }
                                    } catch (err) {
                                      setHermesOAuthError(err instanceof Error ? err.message : 'OAuth command failed')
                                    } finally {
                                      setHermesOAuthBusy(false)
                                    }
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                                >
                                  {hermesOAuthBusy ? 'Running...' : 'Run'}
                                </button>
                              </div>
                              <p className="text-[9px] text-muted-foreground/30">Shows the device-code login link/code output. No API key needed.</p>
                              {hermesOAuthOutput && (() => {
                                const loginUrl = hermesOAuthOutput.match(/https?:\/\/[^\s]+/)?.[0]
                                return (
                                  <div className="space-y-1">
                                    {loginUrl && (
                                      <a
                                        href={loginUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex text-[9px] text-primary/90 underline underline-offset-2 hover:text-primary"
                                      >
                                        Open device login link
                                      </a>
                                    )}
                                    <pre className="max-h-24 overflow-y-auto bg-black/20 rounded px-2 py-1 text-[9px] text-muted-foreground/70 whitespace-pre-wrap break-all">{hermesOAuthOutput}</pre>
                                  </div>
                                )
                              })()}
                              {hermesOAuthError && <p className="text-[9px] text-red-400">{hermesOAuthError}</p>}
                            </div>
                          ) : (
                            <input
                              type="password"
                              value={hermesApiKey}
                              onChange={(e) => setHermesApiKey(e.target.value)}
                              placeholder={`${HERMES_PROVIDERS.find(p => p.id === hermesProvider)?.label || ''} API key`}
                              className="w-full h-7 rounded border border-border/20 bg-card px-2 text-[10px] text-foreground font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          )}

                          {/* Save button */}
                          <button
                            type="button"
                            disabled={hermesConfigBusy}
                            onClick={async () => {
                              setHermesConfigBusy(true)
                              try {
                                const hp = HERMES_PROVIDERS.find(p => p.id === hermesProvider)
                                // Set provider + model
                                await fetch('/api/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run-command', command: `hermes config set model.provider ${hp?.hermesId || hermesProvider}` }) })
                                await fetch('/api/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run-command', command: `hermes config set model.default ${hermesModel}` }) })
                                // Save API key if provided
                                if (hermesApiKey.trim() && hp?.env) {
                                  await fetch('/api/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-env', key: hp.env, value: hermesApiKey }) })
                                }
                                setHermesConfigSaved(true)
                              } catch { /* ignore */ }
                              setHermesConfigBusy(false)
                            }}
                            className="w-full text-2xs py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {hermesConfigBusy ? 'Saving...' : 'Apply Configuration'}
                          </button>

                          {/* OpenClaw migration option */}
                          {runtimes.find(r => r.id === 'openclaw')?.installed && (
                            <div className="pt-1.5 border-t border-border/10">
                              <button
                                type="button"
                                disabled={hermesMigrating}
                                onClick={async () => {
                                  setHermesMigrating(true)
                                  setHermesMigrateResult(null)
                                  try {
                                    const res = await fetch('/api/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run-command', command: 'hermes claw migrate --preset user-data' }) })
                                    const data = await res.json()
                                    setHermesMigrateResult(data.success ? 'Migration complete' : (data.error || 'Migration failed'))
                                  } catch { setHermesMigrateResult('Migration failed') }
                                  setHermesMigrating(false)
                                }}
                                className="text-2xs text-amber-400/70 hover:text-amber-400 transition-colors"
                              >
                                {hermesMigrating ? 'Migrating...' : 'Migrate from OpenClaw'}
                              </button>
                              {hermesMigrateResult && (
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hermesMigrateResult}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {hermesConfigSaved && rt.id === 'hermes' && (
                        <p className="text-2xs text-emerald-400/70 mt-1">Provider configured</p>
                      )}

                      {/* Install actions */}
                      {!rt.installed && !justInstalled && (
                        <div className="mt-2">
                          {installFailed ? (
                            <div className="space-y-1">
                              <p className="text-2xs text-red-400">Install failed: {job?.error || 'Unknown error'}</p>
                              <button
                                onClick={() => handleInstall(rt.id)}
                                className="text-2xs px-2 py-1 rounded border border-border/40 hover:border-border/60 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Retry
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleInstall(rt.id)}
                                className={`text-2xs px-2 py-1 rounded border ${mc.border} ${mc.bgBtn} ${mc.text} ${mc.hoverBg} transition-colors`}
                              >
                                Install
                              </button>
                              {isDocker && (
                                <button
                                  onClick={() => handleCopyCompose(rt.id)}
                                  className="text-2xs px-2 py-1 rounded border border-border/40 hover:border-border/60 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {copiedYaml === rt.id ? 'Copied!' : 'Sidecar YAML'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
        <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          Continue
        </Button>
      </div>

      {setupRuntime && (
        <RuntimeSetupModal
          runtime={setupRuntime}
          onClose={() => setSetupRuntime(null)}
          onComplete={() => {
            setSetupCompleted(prev => new Set([...prev, setupRuntime]))
            setSetupRuntime(null)
            fetchRuntimes()
          }}
        />
      )}
    </>
  )
}
