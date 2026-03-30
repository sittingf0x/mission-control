import assert from 'node:assert/strict';
import test from 'node:test';
import { stripAnsi } from '../skill-architect-client.mjs';

test('stripAnsi removes ANSI escapes', () => {
  assert.equal(stripAnsi('\u001b[1mMatrix\u001b[0m'), 'Matrix');
  assert.equal(stripAnsi('plain'), 'plain');
});
