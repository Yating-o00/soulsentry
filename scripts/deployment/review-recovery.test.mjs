import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicJson, readJson, reconcile, processIdentity } from './records.mjs';
import { syncGithub } from './github.mjs';

const env = { DEPLOY_GITHUB_REPOSITORY: 'owner/repo', DEPLOY_GITHUB_TOKEN: 'fixture' };

function fixture(t, patch) {
  const records = fs.mkdtempSync(path.join(os.tmpdir(), 'record-recovery-'));
  t.after(() => fs.rmSync(records, { recursive: true, force: true }));
  const deploymentId = 'prod-20261125T120000Z-abcdef0-test';
  const dir = path.join(records, deploymentId);
  fs.mkdirSync(dir);
  const file = path.join(dir, 'manifest.json');
  atomicJson(file, { deploymentId, commitSha: 'a'.repeat(40), status: 'failed', phase: 'rollback',
    rollbackStatus: 'success', githubSync: 'pending', finishedAt: new Date().toISOString(), ...patch });
  return { records, deploymentId, dir, file };
}

test('a dead owner before rollback finalization marks the record interrupted and requires verification', (t) => {
  const { records, deploymentId, file } = fixture(t, { process: null, rollbackStatus: 'running', finishedAt: null });
  assert.deepEqual(reconcile(records), [deploymentId]);
  const record = readJson(file);
  assert.equal(record.status, 'interrupted');
  assert.equal(record.rollbackStatus, 'unknown');
  assert.equal(record.needsVerification, true);
  assert.ok(record.finishedAt);
  assert.deepEqual(reconcile(records), []);
});

test('github retry refuses unfinished deployments including live rollback', async t => {
  for (const patch of [{ finishedAt: null }, { rollbackStatus: 'running' }, { status: 'running' }]) {
    const { dir, file } = fixture(t, patch);
    const before = readJson(file);
    const fetchImpl = () => assert.fail('unfinished deployment reached GitHub');
    assert.equal(await syncGithub(dir, { env, fetchImpl }), false);
    assert.deepEqual(readJson(file), before);
  }
});

test('overlapping retries of a finalized live owner create one deployment and one status', async t => {
  const { dir } = fixture(t, { process: processIdentity() });
  let finishLookup;
  let created = 0;
  let statuses = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === 'GET') {
      await new Promise(resolve => { finishLookup = resolve; });
      return { ok: true, json: async () => [] };
    }
    if (url.endsWith('/deployments')) created++;
    else statuses++;
    return { ok: true, json: async () => ({ id: 17 }) };
  };
  const first = syncGithub(dir, { env, fetchImpl });
  assert.equal(await syncGithub(dir, { env, fetchImpl }), false);
  finishLookup();
  assert.equal(await first, true);
  assert.equal(created, 1);
  assert.equal(statuses, 1);
});

test('an abandoned sync lock allows retry and a delayed API response preserves newer local evidence', async t => {
  const { dir, file } = fixture(t);
  atomicJson(path.join(dir, '.record-0.lock'), { pid: process.pid, startToken: 'previous-process', bootId: 'previous-boot' });
  const fetchImpl = async (url, options) => {
    if (options.method === 'GET') return { ok: true, json: async () => [] };
    if (url.endsWith('/statuses')) {
      atomicJson(file, { ...readJson(file), rollbackStatus: 'unverified', needsVerification: true });
    }
    return { ok: true, json: async () => ({ id: 17 }) };
  };
  assert.equal(await syncGithub(dir, { env, fetchImpl }), false);
  const latest = readJson(file);
  assert.equal(latest.rollbackStatus, 'unverified');
  assert.equal(latest.needsVerification, true);
  assert.equal(latest.githubDeploymentId, 17);
  assert.equal(latest.githubSync, 'pending');
  assert.equal(latest.githubSyncError, 'github_summary_changed');
});
