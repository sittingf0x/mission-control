# @openclaw/mc-client

Gateway health check and persona file reader for Mission Control.

## Install (from mission-control-app)

```bash
npm install ../OpenClaw/packages/mc-client
```

Or add to `package.json`:

```json
"dependencies": {
  "@openclaw/mc-client": "file:../OpenClaw/packages/mc-client"
}
```

## Usage

### Gateway Health

```js
import { checkGatewayHealth } from '@openclaw/mc-client';

const baseUrl = process.env.GATEWAY_URL || 'http://localhost:18789';
const { ok, status, error } = await checkGatewayHealth(baseUrl, { retries: 2 });
// ok: true when gateway responds 200
```

### Persona Files (SOUL.md, SKILLS.md, etc.)

```js
import { readPersonaFiles } from '@openclaw/mc-client';

const openclawHome = process.env.OPENCLAW_HOME || require('os').homedir() + '/.openclaw-human';
const { soul, skills, working, mission } = await readPersonaFiles(openclawHome, 'jarvis');
```

**Jarvis** resolves persona files from `workspace/` first (default Jarvis workspace), then `workspace-jarvis/`, then `workspace/agents/jarvis/`.

### Multi-company (registry + active company)

```js
import { readCompanyRegistry, readActiveCompany } from '@openclaw/mc-client';

const openclawHome = process.env.OPENCLAW_HOME || require('os').homedir() + '/.openclaw-human';
const { ok, companies } = await readCompanyRegistry(openclawHome);
// companies: [{ id, name?, summary? }, ...]

const active = await readActiveCompany(openclawHome);
// active.companyId: string | null (from workspace/.active-company)
```

Use `companies` to populate a Mission Control dropdown; use `readActiveCompany` for the current default.

### Skill Architect + Matrix (`matrixPreflight`)

Server-side only (token secret). See **[`docs/mission-control-matrix-integration.md`](../../docs/mission-control-matrix-integration.md)** in the OpenClaw repo.

```js
import {
  postSkillArchitectJob,
  getSkillArchitectJob,
  setSkillArchitectJobStatus,
  checkSkillArchitectHealth,
  stripAnsi,
} from '@openclaw/mc-client';

await checkSkillArchitectHealth('http://127.0.0.1:18990');

const created = await postSkillArchitectJob({
  baseUrl: process.env.SKILL_ARCHITECT_URL,
  token: process.env.SKILL_ARCHITECT_TOKEN,
  urls: ['https://example.com/page'],
  targetAgent: 'jarvis',
  timeoutMs: 180000,
});
// created.job.matrixPreflight — optional Matrix hint; stripAnsi(created.job.matrixPreflight?.suggest?.stdout) for UI
```

### Kanban (file-backed, in-dashboard)

Boards live under **`workspace/Projects/<companyId>/<projectSlug>/kanban/board.json`**. Use **`_`** as `projectSlug` for a company default.

```js
import {
  loadKanbanBoard,
  saveKanbanBoard,
  createTask,
  upsertTask,
  moveTask,
  kanbanBoardPath,
} from '@openclaw/mc-client';

const HOME = process.env.OPENCLAW_HOME || '/openclaw-home';
const board = await loadKanbanBoard(HOME, 'gorilla-netting', '_');
const task = createTask({ title: 'Ship Kanban UI', company: 'gorilla-netting', columnId: 'backlog' });
const next = upsertTask(board, task);
await saveKanbanBoard(HOME, next, 'gorilla-netting', '_');
```

See **[`docs/mission-control-kanban-spec.md`](../../docs/mission-control-kanban-spec.md)** and **[`docs/schemas/kanban-board-v1.schema.json`](../../docs/schemas/kanban-board-v1.schema.json)**.

## API

- **`checkGatewayHealth(baseUrl, opts?)`** — Fetches `/health`, retries on failure. Returns `{ ok, status?, error? }`.
- **`readPersonaFiles(openclawHome, agentId)`** — Reads SOUL.md, SKILLS.md, WORKING.md, MISSION.md from workspace dirs. Returns `{ soul?, skills?, working?, mission? }`.
- **`readCompanyRegistry(openclawHome)`** — Reads `workspace/companies/registry.yaml`. Returns `{ ok, companies, error? }`.
- **`readActiveCompany(openclawHome)`** — Reads `workspace/.active-company` (one line). Returns `{ ok, companyId, error? }`; `companyId` is `null` if file missing.
- **`parseCompanyRegistryYaml(text)`** — Parses registry YAML string (for tests or custom paths).
- **`checkSkillArchitectHealth(baseUrl)`** — `GET /health` on Skill Architect (no token).
- **`postSkillArchitectJob({ baseUrl, token, urls, targetAgent?, timeoutMs? })`** — `POST /v1/jobs`; response **`job`** may include **`matrixPreflight`**.
- **`getSkillArchitectJob({ baseUrl, token, jobId })`** — `GET /v1/jobs/:id`.
- **`setSkillArchitectJobStatus({ baseUrl, token, jobId, action: 'approve'|'reject' })`** — approve/reject job.
- **`stripAnsi(string)`** — Strip ANSI from Matrix CLI stdout for dashboard preview.
- **`loadKanbanBoard` / `saveKanbanBoard`** — File-backed Kanban under `Projects/.../kanban/board.json`.
- **`createTask` / `upsertTask` / `moveTask` / `deleteTask` / `appendActivity` / `setBlockedBy`** — In-memory + persist via `saveKanbanBoard`.
- **`kanbanBoardPath(home, companyId, projectSlug?)`** — Resolved path for operators.
