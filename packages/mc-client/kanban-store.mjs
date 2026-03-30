/**
 * File-backed Kanban boards for Mission Control — lives under OPENCLAW_HOME.
 *
 * Path: workspace/Projects/<companyId>/<projectSlug>/kanban/board.json
 * Use projectSlug `_` for a company default board when no project is selected.
 *
 * @see docs/schemas/kanban-board-v1.schema.json
 * @see docs/mission-control-kanban-spec.md
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {{ id: string, title: string, order: number }} KanbanColumn
 * @typedef {{ ts: number, message: string }} KanbanActivity
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description?: string,
 *   columnId: string,
 *   order: number,
 *   company?: string,
 *   projectSlug?: string,
 *   assigneeAgentId?: string,
 *   blockedBy?: string[],
 *   activity?: KanbanActivity[],
 *   skillArchitectJobId?: string | null,
 *   gatewaySessionId?: string,
 *   reviewUrl?: string,
 * }} KanbanTask
 * @typedef {{
 *   version: 1,
 *   boardId: string,
 *   name?: string,
 *   columns: KanbanColumn[],
 *   tasks: KanbanTask[],
 * }} KanbanBoardV1
 */

/** @type {KanbanColumn[]} */
export const DEFAULT_KANBAN_COLUMNS = [
  { id: 'backlog', title: 'Backlog', order: 0 },
  { id: 'in_progress', title: 'In progress', order: 1 },
  { id: 'review', title: 'Review', order: 2 },
  { id: 'done', title: 'Done', order: 3 },
];

/**
 * @param {string} openclawHome
 * @param {string} companyId
 * @param {string} [projectSlug='_'] — folder under Projects/<companyId>/
 */
export function kanbanBoardPath(openclawHome, companyId, projectSlug = '_') {
  const slug = projectSlug && projectSlug.trim() ? projectSlug.trim() : '_';
  return path.join(openclawHome, 'workspace', 'Projects', companyId, slug, 'kanban', 'board.json');
}

/**
 * @returns {Promise<KanbanBoardV1>}
 */
export async function loadKanbanBoard(openclawHome, companyId, projectSlug = '_') {
  const fp = kanbanBoardPath(openclawHome, companyId, projectSlug);
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const j = JSON.parse(raw);
    if (j?.version !== 1 || !Array.isArray(j.columns) || !Array.isArray(j.tasks)) {
      return emptyBoard(companyId, projectSlug);
    }
    return j;
  } catch (e) {
    if (e?.code === 'ENOENT') return emptyBoard(companyId, projectSlug);
    throw e;
  }
}

function emptyBoard(companyId, projectSlug) {
  const boardId = `${companyId}:${projectSlug || '_'}`;
  return {
    version: 1,
    boardId,
    name: 'Main',
    columns: DEFAULT_KANBAN_COLUMNS.map((c) => ({ ...c })),
    tasks: [],
  };
}

/**
 * @param {string} openclawHome
 * @param {KanbanBoardV1} board
 * @param {string} companyId
 * @param {string} [projectSlug='_']
 */
export async function saveKanbanBoard(openclawHome, board, companyId, projectSlug = '_') {
  const fp = kanbanBoardPath(openclawHome, companyId, projectSlug);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(board, null, 2), 'utf8');
}

/**
 * @param {Partial<KanbanTask> & { title: string, columnId?: string }} partial
 */
export function createTask(partial) {
  const id = randomUUID();
  const columnId = partial.columnId || 'backlog';
  return {
    id,
    title: partial.title || 'Untitled',
    description: partial.description || '',
    columnId,
    order: partial.order ?? Date.now(),
    company: partial.company || '',
    projectSlug: partial.projectSlug || '',
    assigneeAgentId: partial.assigneeAgentId || '',
    blockedBy: partial.blockedBy || [],
    activity: partial.activity || [],
    skillArchitectJobId: partial.skillArchitectJobId ?? null,
    gatewaySessionId: partial.gatewaySessionId || '',
    reviewUrl: partial.reviewUrl || '',
  };
}

/**
 * Move task to column and optional order.
 * @param {KanbanBoardV1} board
 * @param {string} taskId
 * @param {string} columnId
 * @param {number} [order]
 */
export function moveTask(board, taskId, columnId, order) {
  const t = board.tasks.find((x) => x.id === taskId);
  if (!t) return { ok: false, error: 'task_not_found' };
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) return { ok: false, error: 'column_not_found' };
  t.columnId = columnId;
  if (typeof order === 'number') t.order = order;
  return { ok: true, board };
}

/**
 * @param {KanbanBoardV1} board
 * @param {string} taskId
 * @param {string} message
 */
export function appendActivity(board, taskId, message) {
  const t = board.tasks.find((x) => x.id === taskId);
  if (!t) return { ok: false, error: 'task_not_found' };
  if (!t.activity) t.activity = [];
  t.activity.push({ ts: Date.now(), message: String(message).slice(0, 2000) });
  return { ok: true, board };
}

/**
 * @param {KanbanBoardV1} board
 * @param {string} taskId
 * @param {string[]} blockedByTaskIds
 */
export function setBlockedBy(board, taskId, blockedByTaskIds) {
  const t = board.tasks.find((x) => x.id === taskId);
  if (!t) return { ok: false, error: 'task_not_found' };
  t.blockedBy = [...new Set(blockedByTaskIds)].filter((id) => id !== taskId);
  return { ok: true, board };
}

/**
 * @param {KanbanBoardV1} board
 * @param {KanbanTask} task
 */
export function upsertTask(board, task) {
  const i = board.tasks.findIndex((x) => x.id === task.id);
  if (i >= 0) board.tasks[i] = { ...board.tasks[i], ...task, id: task.id };
  else board.tasks.push(task);
  return board;
}

/**
 * @param {KanbanBoardV1} board
 * @param {string} taskId
 */
export function deleteTask(board, taskId) {
  board.tasks = board.tasks.filter((x) => x.id !== taskId);
  return board;
}
