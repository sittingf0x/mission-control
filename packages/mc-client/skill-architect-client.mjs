/**
 * Skill Architect HTTP client — for Mission Control (or any dashboard) on the same host as :18990.
 *
 * Responses may include **matrixPreflight** (Hyperspace Matrix) when the service has
 * HYPERSPACE_USE_CLI=1 and hyperspace on PATH. See docs/mission-control-matrix-integration.md.
 */

/** @param {string} s */
export function stripAnsi(s) {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl - e.g. http://127.0.0.1:18990 (no trailing slash)
 * @param {string} opts.token - contents of skill_architect_token
 * @param {string[]} opts.urls - public https URLs only (SSRF-protected server-side)
 * @param {string} [opts.targetAgent=jarvis]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs=120000]
 */
export async function postSkillArchitectJob(opts) {
  const { baseUrl, token, urls, targetAgent = 'jarvis', timeoutMs = 120000 } = opts;
  const url = `${String(baseUrl).replace(/\/$/, '')}/v1/jobs`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SA-Token': token,
      },
      body: JSON.stringify({ urls, targetAgent }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data };
    }
    return { ok: true, status: res.status, job: data };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.token
 * @param {string} opts.jobId
 */
export async function getSkillArchitectJob(opts) {
  const { baseUrl, token, jobId } = opts;
  const url = `${String(baseUrl).replace(/\/$/, '')}/v1/jobs/${encodeURIComponent(jobId)}`;
  const res = await fetch(url, {
    headers: { 'X-SA-Token': token },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, job: data };
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.token
 * @param {string} opts.jobId
 * @param {'approve'|'reject'} opts.action
 */
export async function setSkillArchitectJobStatus(opts) {
  const { baseUrl, token, jobId, action } = opts;
  const path = action === 'approve' ? 'approve' : 'reject';
  const url = `${String(baseUrl).replace(/\/$/, '')}/v1/jobs/${encodeURIComponent(jobId)}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SA-Token': token,
    },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, job: data };
}

/**
 * Health check (no token required).
 * @param {string} baseUrl
 */
export async function checkSkillArchitectHealth(baseUrl) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}
