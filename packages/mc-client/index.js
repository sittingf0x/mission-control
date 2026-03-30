/**
 * @openclaw/mc-client — Gateway health and persona files for Mission Control
 *
 * Use from mission-control-app API routes or server-side to:
 * - Check gateway health (with retry/backoff)
 * - Read SOUL.md, SKILLS.md, WORKING.md, MISSION.md per agent
 */

/**
 * Check gateway health. Returns { ok, status, error }.
 * Use retries to avoid "Gateway not running" on first failed poll.
 *
 * @param {string} baseUrl - Gateway base URL (e.g. http://localhost:18789 or https://ops.sittingfox.co/gw)
 * @param {object} [opts]
 * @param {number} [opts.retries=2] - Number of retries on failure
 * @param {number} [opts.timeout=5000] - Request timeout ms
 */
export async function checkGatewayHealth(baseUrl, opts = {}) {
  const { retries = 2, timeout = 5000 } = opts;
  const url = baseUrl.replace(/\/$/, '') + '/health';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, data };
      }
      const text = await res.text();
      return { ok: false, status: res.status, error: text.slice(0, 200) };
    } catch (err) {
      const error = err?.message || String(err);
      if (attempt === retries) {
        return { ok: false, error };
      }
      // Exponential backoff: 500ms, 1000ms
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return { ok: false, error: 'Max retries exceeded' };
}

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Read persona files for an agent.
 *
 * @param {string} openclawHome - Path to ~/.openclaw-human or OPENCLAW_HOME
 * @param {string} agentId - Agent id (e.g. jarvis, skill-architect)
 * @returns {Promise<{ soul?: string; skills?: string; working?: string; mission?: string }>}
 */
export async function readPersonaFiles(openclawHome, agentId) {
  const files = ['SOUL.md', 'SKILLS.md', 'WORKING.md', 'MISSION.md'];
  const candidates = [];
  if (agentId === 'jarvis') {
    candidates.push(path.join(openclawHome, 'workspace'));
  }
  candidates.push(
    path.join(openclawHome, 'workspace-' + agentId),
    path.join(openclawHome, 'workspace', 'agents', agentId),
  );

  const result = {};
  for (const name of files) {
    const key = name.replace('.md', '').toLowerCase();
    for (const dir of candidates) {
      try {
        const content = await fs.readFile(path.join(dir, name), 'utf8');
        result[key] = content.trim();
        break;
      } catch {
        /* not found, try next candidate */
      }
    }
  }
  return result;
}

/**
 * Parse minimal registry.yaml (OpenClaw workspace/companies/registry.yaml).
 * @param {string} text
 * @returns {{ id: string, name?: string, summary?: string }[]}
 */
export function parseCompanyRegistryYaml(text) {
  const companies = [];
  let current = null;
  for (const line of text.split('\n')) {
    const idM = line.match(/^\s*-\s*id:\s*(.+)$/);
    if (idM) {
      if (current) companies.push(current);
      current = { id: idM[1].trim() };
      continue;
    }
    if (current) {
      const nameM = line.match(/^\s*name:\s*(.+)$/);
      if (nameM) current.name = nameM[1].trim();
      const sumM = line.match(/^\s*summary:\s*(.+)$/);
      if (sumM) current.summary = sumM[1].trim();
    }
  }
  if (current) companies.push(current);
  return companies;
}

/**
 * Read multi-company registry from workspace/companies/registry.yaml.
 *
 * @param {string} openclawHome - Path to ~/.openclaw-human or OPENCLAW_HOME
 * @returns {Promise<{ ok: boolean, companies: object[], error?: string }>}
 */
export async function readCompanyRegistry(openclawHome) {
  const p = path.join(openclawHome, 'workspace', 'companies', 'registry.yaml');
  try {
    const text = await fs.readFile(p, 'utf8');
    return { ok: true, companies: parseCompanyRegistryYaml(text) };
  } catch (err) {
    const error = err?.message || String(err);
    return { ok: false, companies: [], error };
  }
}

/**
 * Read optional default company id from workspace/.active-company (single line).
 *
 * @param {string} openclawHome
 * @returns {Promise<{ ok: boolean, companyId: string | null, error?: string }>}
 */
export async function readActiveCompany(openclawHome) {
  const p = path.join(openclawHome, 'workspace', '.active-company');
  try {
    const raw = (await fs.readFile(p, 'utf8')).trim();
    const line = raw.split(/\r?\n/)[0]?.trim() || null;
    return { ok: true, companyId: line };
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { ok: true, companyId: null };
    }
    return { ok: false, companyId: null, error: err?.message || String(err) };
  }
}

export {
  stripAnsi,
  postSkillArchitectJob,
  getSkillArchitectJob,
  setSkillArchitectJobStatus,
  checkSkillArchitectHealth,
} from './skill-architect-client.mjs';

export {
  DEFAULT_KANBAN_COLUMNS,
  kanbanBoardPath,
  loadKanbanBoard,
  saveKanbanBoard,
  createTask,
  moveTask,
  appendActivity,
  setBlockedBy,
  upsertTask,
  deleteTask,
} from './kanban-store.mjs';
