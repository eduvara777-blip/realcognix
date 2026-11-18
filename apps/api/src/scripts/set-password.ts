/**
 * Set (or reset) a user's password for built-in login. Dev/ops tool; ends the user's existing sessions.
 *   npm run set-password -- --email priya@realcognix.test [--org realcognix-demo]
 * Password: from NEW_PASSWORD or DEV_ADMIN_PASSWORD, else prompted (hidden). Never pass it as an argument.
 */
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { loadConfig } from '@realcognix/core';
import { Db } from '../lib/db.js';
import { hashPassword } from '../auth/password.js';
import { findLogin, setPassword } from '../auth/pg.js';

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    let asked = false;
    out._writeToOutput = (s: string) => { if (!asked) { process.stdout.write(s); asked = true; } };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const { values } = parseArgs({ options: { email: { type: 'string' }, org: { type: 'string' } } });
if (!values.email) {
  console.error('usage: set-password --email <user email> [--org <org slug>]');
  process.exit(2);
}

const db = new Db(loadConfig().DATABASE_URL);
try {
  const users = await findLogin(db, values.email, values.org);
  if (!users.length) throw new Error(`no user with email ${values.email}${values.org ? ` in org ${values.org}` : ''}`);
  if (users.length > 1) throw new Error(`email exists in several orgs (${users.map((u) => u.org_slug).join(', ')}); pass --org`);
  const u = users[0]!;
  let password = process.env.NEW_PASSWORD || process.env.DEV_ADMIN_PASSWORD || '';
  if (!password) {
    if (!process.stdin.isTTY) throw new Error('set NEW_PASSWORD, or run in a terminal to be prompted');
    password = await prompt(`New password for ${u.email}: `);
    if (password !== (await prompt('Repeat: '))) throw new Error('passwords do not match');
  }
  await setPassword(db, { orgId: u.org_id, userId: u.user_id, hash: await hashPassword(password) });
  console.log(`Password set for ${u.full_name} <${u.email}> (${u.role_key}, org ${u.org_slug}). Existing sessions were signed out.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
