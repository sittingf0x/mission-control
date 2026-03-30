'use client'

import { useCallback, useEffect, useState } from 'react'

type CompanyRow = { id: string; name?: string; summary?: string }

export function CompanyPicker() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/openclaw/companies')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load companies')
      setCompanies(Array.isArray(data.companies) ? data.companies : [])
      setActiveId(typeof data.activeCompanyId === 'string' ? data.activeCompanyId : '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onSelect(companyId: string) {
    if (!companyId || companyId === activeId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/openclaw/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setActiveId(companyId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading && companies.length === 0 && !error) {
    return (
      <div className="hidden lg:flex items-center text-2xs text-muted-foreground px-2" aria-hidden>
        Companies…
      </div>
    )
  }

  if (error && companies.length === 0) {
    return null
  }

  if (companies.length === 0) {
    return null
  }

  return (
    <div className="hidden lg:flex items-center gap-1.5 min-w-0">
      <label htmlFor="mc-active-company" className="text-2xs text-muted-foreground shrink-0">
        Company
      </label>
      <select
        id="mc-active-company"
        className="max-w-[200px] h-8 rounded-md border border-border bg-background text-xs px-2 py-1 truncate"
        value={activeId}
        disabled={saving}
        onChange={(e) => void onSelect(e.target.value)}
        title="Default company id (workspace/.active-company)"
      >
        <option value="">—</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || c.id}
          </option>
        ))}
      </select>
      {error ? <span className="text-2xs text-red-500 truncate max-w-[120px]" title={error}>{error}</span> : null}
    </div>
  )
}
