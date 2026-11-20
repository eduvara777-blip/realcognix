import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db, UnscopedQueryError } from './db.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-0000000000ff';

test('db: no unscoped table access; lookup() only reaches the SECURITY DEFINER functions', async () => {
  const db = new Db('postgres://nobody@127.0.0.1:1/none'); // never connects: every call below is refused first
  await assert.rejects(db.query('SELECT * FROM leads'), UnscopedQueryError);
  await assert.rejects(db.one('SELECT 1'), UnscopedQueryError);
  for (const sql of ['SELECT * FROM leads', 'SELECT 1; DELETE FROM leads', 'select * from auth_login_lookup($1); select 1', 'UPDATE leads SET stage = $1']) {
    await assert.rejects(db.lookup(sql), /only the SECURITY DEFINER lookup functions/, sql);
  }
  assert.throws(() => db.withOrg('not-a-uuid', () => 1), /UUID/);
  assert.throws(() => db.withOrg(ORG, () => db.withOrg(OTHER, () => 1)), /different org/);
  assert.equal(db.withOrg(ORG, () => db.withOrg(ORG, () => db.currentOrg)), ORG, 'same-org nesting is fine');
  await assert.rejects(db.withOrg(ORG, () => db.tx(OTHER, async () => 1)), /differs/);
  assert.equal(db.currentOrg, null);
  await db.close();
});
