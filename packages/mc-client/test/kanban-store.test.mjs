import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendActivity,
  createTask,
  deleteTask,
  kanbanBoardPath,
  loadKanbanBoard,
  moveTask,
  saveKanbanBoard,
  setBlockedBy,
  upsertTask,
} from '../kanban-store.mjs';

test('kanban roundtrip + helpers', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-kanban-'));
  const companyId = 'test-co';
  const project = '_';

  let board = await loadKanbanBoard(home, companyId, project);
  assert.equal(board.version, 1);
  assert.equal(board.tasks.length, 0);

  const t = createTask({ title: 'First', company: companyId, columnId: 'backlog' });
  board = upsertTask(board, t);
  await saveKanbanBoard(home, board, companyId, project);

  const again = await loadKanbanBoard(home, companyId, project);
  assert.equal(again.tasks.length, 1);
  assert.equal(again.tasks[0].title, 'First');

  const r1 = moveTask(again, t.id, 'in_progress', 1);
  assert.equal(r1.ok, true);
  const r2 = appendActivity(r1.board, t.id, 'started');
  assert.equal(r2.ok, true);
  const r3 = setBlockedBy(r2.board, t.id, []);
  assert.equal(r3.ok, true);
  let work = r3.board;

  const t2 = createTask({ title: 'Second', company: companyId });
  work = upsertTask(work, t2);
  work = deleteTask(work, t2.id);
  assert.equal(work.tasks.length, 1);

  await fs.rm(home, { recursive: true, force: true });
});

test('kanbanBoardPath', () => {
  const p = kanbanBoardPath('/home/x/.openclaw-human', 'acme', 'my-proj');
  assert.ok(p.endsWith(path.join('Projects', 'acme', 'my-proj', 'kanban', 'board.json')));
});
