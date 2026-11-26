#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { reconcile, readJson } from './records.mjs';
import { syncGithub, publicSummary } from './github.mjs';

const args = process.argv.slice(2);
const shared = process.env.SHARED_DIR || path.join(process.env.APP_ROOT || '/opt/soulsentry', 'shared');
const records = path.join(shared, 'deployments');
// --reconcile only classifies dead owners. It never changes releases, services or databases.
if (args.includes('--reconcile')) reconcile(records);
const id = args.find((a) => !a.startsWith('--'));
if (id && !/^prod-\d{8}T\d{6}Z-[a-zA-Z0-9-]{7,80}$/.test(id)) throw new Error('Invalid deployment ID');
const dirs = id ? [id] : fs.existsSync(records) ? fs.readdirSync(records).sort() : [];
for (const name of dirs) {
  const dir = path.join(records, name);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
  if (args.includes('--retry-github')) await syncGithub(dir);
  const m = readJson(path.join(dir, 'manifest.json'));
  console.log(JSON.stringify(args.includes('--public') ? publicSummary(m) : m));
}
