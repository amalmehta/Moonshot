// Every model-vs-published check must land inside its stated tolerance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAll } from '../js/validation/index.js';

for (const row of runAll()) {
  test(`[${row.section}] ${row.quantity}`, () => {
    assert.ok(Number.isFinite(row.computed), 'computed value is finite');
    assert.ok(row.pass, `computed ${row.computed} vs reported ${row.reported} ${row.unit}: error ${(row.error * 100).toFixed(2)}% > ±${row.tolerance * 100}%`);
  });
}
