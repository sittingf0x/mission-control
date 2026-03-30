'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { parseGitHubPrUrl } from '@/lib/github-pr-links'

type KanbanColumn = { id: string; title: string; order: number }
type KanbanTask = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number
  blockedBy?: string[]
  assigneeAgentId?: string
  activity?: { ts: number; message: string }[]
  reviewUrl?: string
}

type KanbanBoard = {
  version: 1
  boardId: string
  name?: string
  columns: KanbanColumn[]
  tasks: KanbanTask[]
}

type CompanyRow = { id: string; name?: string }
type AgentRow = { name: string }

export function KanbanPanel() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [projectSlug] = useState('_')
  const [board, setBoard] = useState<KanbanBoard | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [linearInfo, setLinearInfo] = useState<{
    configured: boolean
    workspaceUrl: string
    teams?: { id: string; key: string; name: string }[]
  } | null>(null)
  const [linearTeamId, setLinearTeamId] = useState('')
  const [linearBusy, setLinearBusy] = useState(false)

  const [newTitle, setNewTitle] = useState('')
  const [newCol, setNewCol] = useState('backlog')
  const [editTask, setEditTask] = useState<KanbanTask | null>(null)
  const [blockedText, setBlockedText] = useState('')
  const [descText, setDescText] = useState('')
  const [assignee, setAssignee] = useState('')
  const [reviewUrl, setReviewUrl] = useState('')
  const [starting, setStarting] = useState(false)

  const sortedColumns = useMemo(
    () => [...(board?.columns || [])].sort((a, b) => a.order - b.order),
    [board?.columns],
  )

  const loadCompanies = useCallback(async () => {
    const res = await fetch('/api/openclaw/companies')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Companies')
    const list: CompanyRow[] = Array.isArray(data.companies) ? data.companies : []
    setCompanies(list)
    const preferred =
      (typeof data.activeCompanyId === 'string' && data.activeCompanyId) ||
      list[0]?.id ||
      ''
    setCompanyId(preferred)
  }, [])

  const loadAgents = useCallback(async () => {
    const res = await fetch('/api/agents?limit=100')
    const data = await res.json()
    if (!res.ok) return
    const list = (data.agents || []) as Array<{ name: string }>
    setAgents(list.map((a) => ({ name: a.name })))
  }, [])

  const loadLinear = useCallback(async () => {
    const res = await fetch('/api/integrations/linear?teams=1')
    const data = await res.json()
    if (res.ok) {
      const teams = Array.isArray(data.teams) ? data.teams : undefined
      setLinearInfo({
        configured: data.configured === true,
        workspaceUrl: typeof data.workspaceUrl === 'string' ? data.workspaceUrl : 'https://linear.app',
        teams,
      })
      if (teams && teams.length === 1) setLinearTeamId(teams[0].id)
    }
  }, [])

  const loadBoard = useCallback(async (cid: string) => {
    if (!cid) {
      setBoard(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/kanban/${encodeURIComponent(cid)}/${encodeURIComponent(projectSlug)}`,
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kanban load failed')
      setBoard(data as KanbanBoard)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }, [projectSlug])

  useEffect(() => {
    void loadCompanies().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [loadCompanies])

  useEffect(() => {
    void loadAgents()
    void loadLinear()
  }, [loadAgents, loadLinear])

  useEffect(() => {
    if (companyId) void loadBoard(companyId)
  }, [companyId, loadBoard])

  async function persist(next: KanbanBoard) {
    if (!companyId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        `/api/kanban/${encodeURIComponent(companyId)}/${encodeURIComponent(projectSlug)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setBoard(data as KanbanBoard)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function moveTask(taskId: string, columnId: string) {
    if (!board) return
    const next: KanbanBoard = {
      ...board,
      tasks: board.tasks.map((x) =>
        x.id === taskId ? { ...x, columnId } : x,
      ),
    }
    void persist(next)
  }

  function addTask() {
    if (!board || !newTitle.trim()) return
    const id = crypto.randomUUID()
    const col = newCol
    const task: KanbanTask = {
      id,
      title: newTitle.trim(),
      columnId: col,
      order: Date.now(),
      blockedBy: [],
      assigneeAgentId: 'jarvis',
    }
    const next: KanbanBoard = { ...board, tasks: [...board.tasks, task] }
    setNewTitle('')
    void persist(next)
  }

  function openEdit(t: KanbanTask) {
    setEditTask(t)
    setBlockedText((t.blockedBy || []).join(', '))
    setDescText(t.description || '')
    setAssignee(t.assigneeAgentId || 'jarvis')
    setReviewUrl(t.reviewUrl || '')
  }

  function saveEdit() {
    if (!board || !editTask) return
    const ids = blockedText
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const next: KanbanBoard = {
      ...board,
      tasks: board.tasks.map((t) =>
        t.id === editTask.id
          ? {
              ...t,
              blockedBy: ids,
              description: descText,
              assigneeAgentId: assignee || 'jarvis',
              reviewUrl: reviewUrl.trim() || undefined,
            }
          : t,
      ),
    }
    setEditTask(null)
    void persist(next)
  }

  const prLinks = useMemo(() => parseGitHubPrUrl(reviewUrl), [reviewUrl])

  async function createLinearIssue() {
    if (!editTask || !board || !companyId || !linearInfo?.configured) return
    setLinearBusy(true)
    setError('')
    try {
      const body: { title: string; description?: string; teamId?: string } = {
        title: editTask.title,
        description: descText || undefined,
        teamId: linearTeamId || undefined,
      }
      let res = await fetch('/api/integrations/linear/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      let data = await res.json()
      if (res.status === 400 && data.teams) {
        setLinearInfo((prev) => (prev ? { ...prev, teams: data.teams } : null))
        setError('Select a Linear team, then retry.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Linear create failed')
      const url = data.url as string
      const identifier = (data.identifier as string) || 'issue'
      const next: KanbanBoard = {
        ...board,
        tasks: board.tasks.map((t) =>
          t.id === editTask.id
            ? {
                ...t,
                reviewUrl: url,
                activity: [
                  ...(t.activity || []),
                  { ts: Date.now(), message: `Linear ${identifier}` },
                ],
              }
            : t,
        ),
      }
      setReviewUrl(url)
      const updated = next.tasks.find((x) => x.id === editTask.id) || null
      if (updated) setEditTask(updated)
      await persist(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Linear failed')
    } finally {
      setLinearBusy(false)
    }
  }

  async function startTask(force?: boolean) {
    if (!editTask || !companyId) return
    setStarting(true)
    setError('')
    try {
      const q = force ? '?force=1' : ''
      const res = await fetch(
        `/api/kanban/${encodeURIComponent(companyId)}/${encodeURIComponent(projectSlug)}/tasks/${encodeURIComponent(editTask.id)}/start${q}`,
        { method: 'POST' },
      )
      const data = await res.json()
      if (res.status === 409 && data.blockedTaskIds) {
        const ok = window.confirm(
          'Dependencies not in Done. Start anyway?',
        )
        if (ok) await startTask(true)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Start failed')
      await loadBoard(companyId)
      setEditTask(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Start failed')
    } finally {
      setStarting(false)
    }
  }

  if (loading && !board && !error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading Kanban…</div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-lg font-semibold">Kanban</h1>
          <p className="text-xs text-muted-foreground">
            Board file: workspace/Projects/&lt;company&gt;/_/kanban/board.json —{' '}
            <span className="text-foreground/80">Start task</span> sends to the gateway agent (session key required).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="kanban-company">
            Company
          </label>
          <select
            id="kanban-company"
            className="h-9 rounded-md border border-border bg-background text-sm px-2"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </div>
        {linearInfo ? (
          <div className="text-2xs text-muted-foreground flex items-center gap-2">
            <span>Linear:</span>
            {linearInfo.configured ? (
              <span className="text-green-600">API key set</span>
            ) : (
              <span>optional — set LINEAR_API_KEY in MC env</span>
            )}
            <a
              href={linearInfo.workspaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Open workspace
            </a>
          </div>
        ) : null}
        {saving ? <span className="text-xs text-muted-foreground">Saving…</span> : null}
        {error ? <span className="text-xs text-red-500">{error}</span> : null}
      </div>

      {!companyId ? (
        <p className="text-sm text-muted-foreground">Select a company with a registry entry.</p>
      ) : !board ? (
        <p className="text-sm text-muted-foreground">No board data.</p>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-3 flex flex-wrap gap-2 items-end">
            <input
              className="border rounded px-3 py-2 bg-background text-sm min-w-[200px]"
              placeholder="New task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <select
              className="border rounded px-3 py-2 bg-background text-sm"
              value={newCol}
              onChange={(e) => setNewCol(e.target.value)}
            >
              {sortedColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <Button size="sm" type="button" onClick={addTask} disabled={!newTitle.trim()}>
              Add task
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {sortedColumns.map((col) => {
              const tasks = board.tasks
                .filter((t) => t.columnId === col.id)
                .sort((a, b) => a.order - b.order)
              return (
                <div key={col.id} className="rounded-lg border bg-muted/20 min-h-[280px] flex flex-col">
                  <div className="px-3 py-2 border-b font-medium text-sm">{col.title}</div>
                  <div className="p-2 space-y-2 flex-1 overflow-auto">
                    {tasks.map((t) => (
                      <div
                        key={t.id}
                        className="rounded border bg-card p-2 text-sm space-y-1 shadow-sm"
                      >
                        <button
                          type="button"
                          className="font-medium text-left w-full hover:underline"
                          onClick={() => openEdit(t)}
                        >
                          {t.title}
                        </button>
                        {t.description ? (
                          <div className="text-2xs text-muted-foreground line-clamp-2">{t.description}</div>
                        ) : null}
                        {t.assigneeAgentId ? (
                          <div className="text-2xs text-muted-foreground">→ {t.assigneeAgentId}</div>
                        ) : null}
                        {t.reviewUrl ? (
                          <div className="space-y-0.5">
                            <a
                              href={t.reviewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-2xs text-primary block truncate"
                            >
                              Review / diff
                            </a>
                            {(() => {
                              const pr = parseGitHubPrUrl(t.reviewUrl || '')
                              if (!pr) return null
                              return (
                                <div className="flex flex-wrap gap-1.5 text-2xs">
                                  <a
                                    href={pr.files}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline"
                                  >
                                    Files
                                  </a>
                                  <a
                                    href={pr.commits}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline"
                                  >
                                    Commits
                                  </a>
                                  <a
                                    href={pr.checks}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline"
                                  >
                                    Checks
                                  </a>
                                </div>
                              )
                            })()}
                          </div>
                        ) : null}
                        {t.blockedBy && t.blockedBy.length > 0 ? (
                          <div className="text-2xs text-amber-600">
                            Blocked by: {t.blockedBy.join(', ')}
                          </div>
                        ) : null}
                        {t.activity && t.activity.length > 0 ? (
                          <div className="text-2xs text-muted-foreground border-t pt-1 mt-1">
                            {t.activity[t.activity.length - 1]?.message}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-1 pt-1">
                          {sortedColumns
                            .filter((c) => c.id !== col.id)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="text-2xs px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80"
                                onClick={() => moveTask(t.id, c.id)}
                              >
                                → {c.title}
                              </button>
                            ))}
                          <button
                            type="button"
                            className="text-2xs px-2 py-0.5 rounded border border-border"
                            onClick={() => openEdit(t)}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {editTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-card border rounded-lg p-4 max-w-lg w-full space-y-3 shadow-lg my-8">
            <div className="font-medium">Task</div>
            <p className="text-sm">{editTask.title}</p>
            <label className="text-xs text-muted-foreground block">Description</label>
            <textarea
              className="w-full border rounded px-3 py-2 bg-background text-sm min-h-[80px]"
              value={descText}
              onChange={(e) => setDescText(e.target.value)}
            />
            <label className="text-xs text-muted-foreground block">Assignee (gateway agent)</label>
            <select
              className="w-full border rounded px-3 py-2 bg-background text-sm"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              {agents.length === 0 ? (
                <option value="jarvis">jarvis</option>
              ) : (
                agents.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))
              )}
            </select>
            <label className="text-xs text-muted-foreground block">Review / PR URL (optional)</label>
            <input
              className="w-full border rounded px-3 py-2 bg-background text-sm"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              placeholder="https://github.com/org/repo/pull/123"
            />
            {prLinks ? (
              <div className="flex flex-wrap gap-2 text-2xs">
                <a href={prLinks.files} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Files
                </a>
                <a href={prLinks.commits} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Commits
                </a>
                <a href={prLinks.checks} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Checks
                </a>
              </div>
            ) : null}
            {linearInfo?.configured ? (
              <div className="space-y-2 border rounded p-2 bg-muted/20">
                <div className="text-2xs font-medium text-muted-foreground">Linear</div>
                {linearInfo.teams && linearInfo.teams.length > 1 ? (
                  <select
                    className="w-full border rounded px-2 py-1.5 bg-background text-sm"
                    value={linearTeamId}
                    onChange={(e) => setLinearTeamId(e.target.value)}
                  >
                    <option value="">Select team…</option>
                    {linearInfo.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.key} — {t.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={linearBusy}
                  onClick={() => void createLinearIssue()}
                >
                  {linearBusy ? 'Creating…' : 'Create Linear issue & link'}
                </Button>
              </div>
            ) : null}
            <label className="text-xs text-muted-foreground block">Blocked by (task ids)</label>
            <input
              className="w-full border rounded px-3 py-2 bg-background text-sm"
              value={blockedText}
              onChange={(e) => setBlockedText(e.target.value)}
              placeholder="uuid, uuid2"
            />
            {editTask.activity && editTask.activity.length > 0 ? (
              <div className="text-xs border rounded p-2 bg-muted/30 max-h-32 overflow-auto">
                <div className="font-medium text-2xs mb-1">Activity</div>
                {editTask.activity.slice(-8).map((a, i) => (
                  <div key={i} className="text-2xs text-muted-foreground">
                    {new Date(a.ts).toLocaleString()}: {a.message}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-between pt-2">
              <Button
                type="button"
                variant="default"
                disabled={starting}
                onClick={() => void startTask()}
              >
                {starting ? 'Starting…' : 'Start task (gateway)'}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => setEditTask(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
