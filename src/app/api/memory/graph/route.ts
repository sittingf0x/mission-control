import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { config } from '@/lib/config'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

interface AgentFileInfo {
  path: string
  chunks: number
  textSize: number
}

interface AgentGraphData {
  name: string
  dbSize: number
  totalChunks: number
  totalFiles: number
  files: AgentFileInfo[]
}

const memoryDbDir = config.openclawStateDir
  ? path.join(config.openclawStateDir, 'memory')
  : ''

function getAgentData(dbPath: string, agentName: string): AgentGraphData | null {
  try {
    const dbStat = statSync(dbPath)
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })

    let files: AgentFileInfo[] = []
    let totalChunks = 0
    let totalFiles = 0

    try {
      // Check if chunks table exists
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'")
        .get() as { name: string } | undefined

      if (tableCheck) {
        // Use COUNT only — skip SUM(LENGTH(text)) which forces a full data scan
        const rows = db
          .prepare(
            'SELECT path, COUNT(*) as chunks FROM chunks GROUP BY path ORDER BY chunks DESC'
          )
          .all() as Array<{ path: string; chunks: number }>

        files = rows.map((r) => ({
          path: r.path || '(unknown)',
          chunks: r.chunks,
          textSize: 0,
        }))

        totalChunks = files.reduce((sum, f) => sum + f.chunks, 0)
        totalFiles = files.length
      }
    } finally {
      db.close()
    }

    return {
      name: agentName,
      dbSize: dbStat.size,
      totalChunks,
      totalFiles,
      files,
    }
  } catch (err) {
    logger.warn(`Failed to read memory DB for agent "${agentName}": ${err}`)
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  if (!memoryDbDir || !existsSync(memoryDbDir)) {
    return NextResponse.json(
      { error: 'Memory directory not available', agents: [] },
      { status: 404 }
    )
  }

  const agentFilter = request.nextUrl.searchParams.get('agent') || 'all'

  try {
    const entries = readdirSync(memoryDbDir).filter((f) => f.endsWith('.sqlite'))
    const dbAgents = new Map<string, AgentGraphData>()

    for (const entry of entries) {
      const agentName = entry.replace('.sqlite', '')
      const dbPath = path.join(memoryDbDir, entry)
      const data = getAgentData(dbPath, agentName)
      if (data) dbAgents.set(agentName, data)
    }

    // Collapse legacy local aliasing: jarvis is the canonical agent, main is stale local history.
    if (dbAgents.has('jarvis') && dbAgents.has('main')) {
      dbAgents.delete('main')
    }

    const agents: AgentGraphData[] = []
    const seen = new Set<string>()

    try {
      const db = getDatabase()
      const rows = db.prepare('SELECT name FROM agents ORDER BY name').all() as Array<{ name: string }>
      for (const row of rows) {
        const name = row.name
        if (!name || seen.has(name)) continue
        seen.add(name)
        const data = dbAgents.get(name)
        agents.push(data || { name, dbSize: 0, totalChunks: 0, totalFiles: 0, files: [] })
      }
    } catch (err) {
      logger.warn(`Failed to read registered agents for memory graph: ${err}`)
    }

    for (const [name, data] of dbAgents.entries()) {
      if (seen.has(name)) continue
      seen.add(name)
      agents.push(data)
    }

    const filtered = agentFilter === 'all' ? agents : agents.filter((agent) => agent.name === agentFilter)

    // Sort by total chunks descending, then name for stable zero-count ordering.
    filtered.sort((a, b) => (b.totalChunks - a.totalChunks) || a.name.localeCompare(b.name))

    return NextResponse.json({ agents: filtered })
  } catch (err) {
    logger.error(`Failed to build memory graph data: ${err}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
