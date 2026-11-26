import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { atomicJson, readJson, reconcile, acquireLock, processIdentity, pruneRecords } from './records.mjs';
import { publicSummary, syncGithub } from './github.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const realRsync = execFileSync('which', ['rsync'], { encoding: 'utf8' }).trim();
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-test-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const app = path.join(root, 'app');
  const old = path.join(app, 'releases', 'previous');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(repo, 'scripts/deployment'), { recursive: true });
  fs.cpSync(source, path.join(repo, 'scripts/deployment'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'backend/prisma'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'backend/prisma/schema.prisma'), '// same schema\n');
  fs.writeFileSync(path.join(repo, 'backend.env'), 'PRIVATE_CONFIG=never-copy\n');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const identity = { deploymentId: 'prod-20261125T120000Z-abcdef0-test', commitSha: sha, builtAt: '2026-11-25T12:00:00.000Z' };
  const oldIdentity = { ...identity, deploymentId: 'prod-20261124T120000Z-abcdef0-old', commitSha: 'a'.repeat(40) };
  fs.mkdirSync(path.join(old, 'dist/assets'), { recursive: true });
  fs.mkdirSync(path.join(old, 'backend/prisma'), { recursive: true });
  fs.writeFileSync(path.join(old, 'backend/prisma/schema.prisma'), '// same schema\n');
  fs.writeFileSync(path.join(old, 'dist/index.html'), 'old frontend');
  fs.writeFileSync(path.join(old, 'dist/assets/old.js'), 'old');
  atomicJson(path.join(old, 'release-identity.json'), oldIdentity);
  atomicJson(path.join(old, 'dist/release-identity.json'), oldIdentity);
  fs.mkdirSync(path.join(old, 'backend/uploads'), { recursive: true });
  fs.writeFileSync(path.join(old, 'backend/uploads/user-photo'), 'keep-user-data');
  fs.mkdirSync(path.join(app, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(app, 'shared/backend.env'), 'DATABASE_URL=file:/private/user.db\n');
  fs.writeFileSync(path.join(app, 'shared/user.db'), 'unchanged database');
  fs.symlinkSync(old, path.join(app, 'current'));
  fs.cpSync(path.join(old, 'dist'), path.join(root, 'web'), { recursive: true });
  atomicJson(path.join(app, 'runtime.json'), oldIdentity);
  fs.mkdirSync(bin);
  const stub = `#!${node}
import fs from 'node:fs'; import path from 'node:path'; import {spawnSync} from 'node:child_process';
const app=process.env.APP_ROOT, command=path.basename(process.argv[1]), args=process.argv.slice(2);
const current=fs.realpathSync(path.join(app,'current')); const expected=JSON.parse(fs.readFileSync(path.join(current,'release-identity.json')));
if(command==='npm') {
 fs.appendFileSync(path.join(app,'npm-calls'),JSON.stringify(args)+'\\n');
 if(process.env.FAKE_HOLD && args.includes('ci')) { fs.writeFileSync(path.join(app,'holding'),String(process.pid)); await new Promise(r=>setTimeout(r,Number(process.env.FAKE_HOLD))); }
} else if(command==='systemctl') {
 if(args[0]==='restart') {
  if(process.env.FAKE_FAIL_ROLLBACK && current.endsWith('/previous')) process.exit(1);
  const value=process.env.FAKE_STALE_VERSION ? JSON.parse(fs.readFileSync(path.join(app,'releases/previous/release-identity.json'))) : expected;
  fs.writeFileSync(path.join(app,'runtime.json'),JSON.stringify(value));
 }
} else if(command==='curl') {
 const url=args.at(-1);
 if(url.includes('/api/health')) console.log(JSON.stringify({ok:true}));
 else if(url.includes('/api/version')) console.log(fs.readFileSync(path.join(app,'runtime.json'),'utf8'));
 else console.log(fs.readFileSync(path.join(process.env.WEB_ROOT,'release-identity.json'),'utf8'));
} else if(command==='rsync') {
 if(process.env.FAKE_PARTIAL_PUBLISH && args.at(-1)===process.env.WEB_ROOT+'/' && !args.at(-2).includes('/previous/') && !fs.existsSync(path.join(app,'publish-failed'))) {
  fs.writeFileSync(path.join(app,'publish-failed'),'1'); fs.writeFileSync(path.join(process.env.WEB_ROOT,'index.html'),'partial publish'); process.exit(1);
 }
 const r=spawnSync(${JSON.stringify(realRsync)},args,{stdio:'inherit'});process.exit(r.status??1);
}
`;
  for (const name of ['npm', 'systemctl', 'curl', 'rsync']) fs.writeFileSync(path.join(bin, name), stub, { mode: 0o755 });
  // Node treats extensionless scripts as CommonJS unless this directory declares ESM.
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"module"}');
  const artifactDir = path.join(root, 'package');
  fs.mkdirSync(path.join(artifactDir, 'dist/assets'), { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'dist/index.html'), 'new frontend');
  fs.writeFileSync(path.join(artifactDir, 'dist/assets/new.js'), 'new');
  function artifact(next = identity) {
    atomicJson(path.join(artifactDir, 'release-identity.json'), next);
    atomicJson(path.join(artifactDir, 'dist/release-identity.json'), next);
    const file = path.join(root, `${next.deploymentId}.tar.gz`);
    execFileSync('tar', ['-czf', file, '-C', artifactDir, 'release-identity.json', 'dist']);
    return { file, hash: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), id: next.deploymentId };
  }
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, APP_ROOT: app, WEB_ROOT: path.join(root, 'web'), PUBLIC_HEALTH_URL: 'https://example.invalid/api/health' };
  delete env.DEPLOY_GITHUB_REPOSITORY; delete env.SKIP_FRONTEND_BUILD;
  function start(a = artifact(), extra = {}) {
    const p = spawn(node, [path.join(repo, 'scripts/deployment/deploy.mjs'), '--deployment-id', a.id, '--artifact', a.file, '--sha256', a.hash], { env: { ...env, ...extra } });
    let output = ''; p.stdout.on('data', (x) => output += x); p.stderr.on('data', (x) => output += x);
    p.done = new Promise((resolve) => p.on('close', (code, signal) => resolve({ code, signal, output })));
    return p;
  }
  const manifest = (id = identity.deploymentId) => readJson(path.join(app, 'shared/deployments', id, 'manifest.json'));
  return { root, repo, app, old, identity, oldIdentity, artifactDir, artifact, env, start, manifest };
}
async function until(fn) {
  for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error('Timed out waiting for fixture');
}

test('prebuilt deployment records identity and verifies both front/backend without DB mutation or frontend build', async (t) => {
  const f = fixture(t); const result = await f.start().done;
  assert.equal(result.code, 0, result.output);
  const m = f.manifest(); assert.equal(m.status, 'success'); assert.equal(m.commitSha, f.identity.commitSha);
  assert.deepEqual(m.health, { local: true, public: true, version: true, frontend: true });
  assert.equal(fs.readFileSync(path.join(f.app, 'shared/user.db'), 'utf8'), 'unchanged database');
  assert.equal(fs.readFileSync(path.join(f.root, 'web/index.html'), 'utf8'), 'new frontend');
  assert.equal(fs.readFileSync(path.join(f.app, 'shared/uploads/user-photo'), 'utf8'), 'keep-user-data');
  assert.equal(fs.existsSync(path.join(m.targetRelease, 'backend.env')), false);
  assert.equal(fs.readFileSync(path.join(m.targetRelease, 'backend/.env'), 'utf8'), 'DATABASE_URL=file:/private/user.db\n');
  const calls = fs.readFileSync(path.join(f.app, 'npm-calls'), 'utf8'); assert.ok(!calls.includes('build')); assert.ok(!calls.includes('push'));
  const events = fs.readFileSync(path.join(f.app, 'shared/deployments', m.deploymentId, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).status, 'success'); assert.ok(fs.statSync(path.join(f.app, 'shared/deployments', m.deploymentId, 'deploy.log')).size > 0);
});
test('checksum failure is recorded before mutation', async (t) => {
  const f = fixture(t); const a = f.artifact(); a.hash = '0'.repeat(64);
  assert.equal((await f.start(a).done).code, 1); const m = f.manifest();
  assert.equal(m.status, 'failed'); assert.equal(m.failurePhase, 'validate_artifact'); assert.equal(m.rollbackStatus, 'not_required');
  assert.equal(fs.realpathSync(path.join(f.app, 'current')), f.old);
});
test('path traversal archive is rejected without extracting outside staging', async (t) => {
  const f = fixture(t); const a = f.artifact();
  const header = Buffer.alloc(512);
  header.write('dist/../../escaped'); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write('00000000001\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header.write('0', 156);
  const checksum = header.reduce((sum, x) => sum + x, 0); header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  fs.writeFileSync(a.file, gzipSync(Buffer.concat([header, Buffer.from('x'), Buffer.alloc(511 + 1024)])));
  a.hash = createHash('sha256').update(fs.readFileSync(a.file)).digest('hex');
  const result = await f.start(a).done; assert.equal(result.code, 1, result.output);
  assert.equal(f.manifest().failurePhase, 'validate_artifact');
  assert.equal(fs.existsSync(path.join(f.app, 'escaped')), false);
  assert.equal(fs.realpathSync(path.join(f.app, 'current')), f.old);
});
test('existing tracked backend.env changes are preserved and never copied into a release', async (t) => {
  const f = fixture(t); fs.writeFileSync(path.join(f.repo, 'backend.env'), 'PRIVATE_CONFIG=local-existing');
  const result = await f.start().done; assert.equal(result.code, 0, result.output);
  assert.equal(fs.readFileSync(path.join(f.repo, 'backend.env'), 'utf8'), 'PRIVATE_CONFIG=local-existing');
  assert.equal(fs.existsSync(path.join(f.manifest().targetRelease, 'backend.env')), false);
});
test('rejects artifact identity mismatch, source mismatch and symlink entries', async (t) => {
  for (const failure of ['identity', 'source', 'symlink']) {
    const f = fixture(t); let a;
    if (failure === 'identity') {
      a = f.artifact(); atomicJson(path.join(f.artifactDir, 'dist/release-identity.json'), { ...f.identity, builtAt: '2020-01-01T00:00:00Z' });
    } else if (failure === 'source') a = f.artifact({ ...f.identity, commitSha: 'b'.repeat(40) });
    else { fs.symlinkSync('/etc/passwd', path.join(f.artifactDir, 'dist/assets/unsafe')); a = f.artifact(); }
    if (failure === 'identity') { execFileSync('tar', ['-czf', a.file, '-C', f.artifactDir, 'release-identity.json', 'dist']); a.hash = createHash('sha256').update(fs.readFileSync(a.file)).digest('hex'); }
    const result = await f.start(a).done; assert.equal(result.code, 1, `${failure}: ${result.output}`);
    assert.equal(fs.realpathSync(path.join(f.app, 'current')), f.old); assert.equal(f.manifest().status, 'failed');
  }
});
test('old process still serving HTTP 200 fails identity verification and rolls both layers back', async (t) => {
  const f = fixture(t); const result = await f.start(undefined, { FAKE_STALE_VERSION: '1' }).done;
  assert.equal(result.code, 1, result.output); const m = f.manifest();
  assert.equal(m.failurePhase, 'verify'); assert.equal(m.health.version, false); assert.equal(m.rollbackStatus, 'success');
  assert.equal(fs.realpathSync(path.join(f.app, 'current')), f.old); assert.equal(fs.readFileSync(path.join(f.root, 'web/index.html'), 'utf8'), 'old frontend');
});
test('partially failed static publish is restored, failed rollback never reports success', async (t) => {
  for (const failRollback of [false, true]) {
    const f = fixture(t); const result = await f.start(undefined, { FAKE_PARTIAL_PUBLISH: '1', ...(failRollback ? { FAKE_FAIL_ROLLBACK: '1' } : {}) }).done;
    assert.equal(result.code, 1, result.output); assert.equal(f.manifest().rollbackStatus, failRollback ? 'failed' : 'success');
    assert.equal(fs.readFileSync(path.join(f.root, 'web/index.html'), 'utf8'), 'old frontend');
    assert.equal(f.manifest().status, 'failed');
  }
});
test('parallel deployment cannot overlap a live lock', async (t) => {
  const f = fixture(t); const first = f.start(undefined, { FAKE_HOLD: '1500' });
  await until(() => fs.existsSync(path.join(f.app, 'holding')));
  const secondIdentity = { ...f.identity, deploymentId: 'prod-20261125T120001Z-abcdef0-second' };
  const second = await f.start(f.artifact(secondIdentity)).done;
  assert.equal(second.code, 1, second.output); assert.match(second.output, /Another deployment/);
  assert.equal((await first.done).code, 0); assert.equal(f.manifest(secondIdentity.deploymentId).failurePhase, 'start');
});
test('SIGTERM records interruption; SIGKILL is reconciled as unknown, stale lock fails closed', async (t) => {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const f = fixture(t); const p = f.start(undefined, { FAKE_HOLD: '60000' });
    await until(() => fs.existsSync(path.join(f.app, 'holding')));
    const child = Number(fs.readFileSync(path.join(f.app, 'holding')));
    p.kill(signal); if (signal === 'SIGKILL') process.kill(child, 'SIGKILL');
    await p.done;
    const records = path.join(f.app, 'shared/deployments');
    reconcile(records);
    const m = f.manifest(); assert.equal(m.status, 'interrupted');
    if (signal === 'SIGKILL') { assert.equal(m.needsVerification, true); assert.equal(m.rollbackStatus, 'unknown'); assert.throws(() => acquireLock(path.join(f.app, 'shared'), { ...processIdentity(), token: 'other' }), /Stale deployment lock/); }
  }
});
test('GitHub summary is allowlisted; API failure stays pending and retry reuses deployment', async (t) => {
  const f = fixture(t); await f.start().done;
  const dir = path.join(f.app, 'shared/deployments', f.identity.deploymentId);
  const m = f.manifest(); m.secret = 'DO_NOT_PUBLISH'; m.failureReason = 'token=secret'; atomicJson(path.join(dir, 'manifest.json'), m);
  const env = { DEPLOY_GITHUB_REPOSITORY: 'owner/repo', DEPLOY_GITHUB_TOKEN: 'private-token' };
  const calls = []; let failStatus = true;
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: options.body && JSON.parse(options.body) });
    if (options.method === 'GET') return { ok: true, json: async () => [] };
    if (url.endsWith('/deployments')) return { ok: true, json: async () => ({ id: 12 }) };
    if (failStatus) { failStatus = false; return { ok: false, status: 503 }; }
    return { ok: true, json: async () => ({ id: 23 }) };
  };
  assert.equal(await syncGithub(dir, { env, fetchImpl }), false); assert.equal(f.manifest().githubSync, 'pending');
  assert.equal(await syncGithub(dir, { env, fetchImpl }), true); assert.equal(f.manifest().githubSync, 'synced');
  assert.equal(calls.filter((c) => c.url.endsWith('/deployments')).length, 1);
  const exported = JSON.stringify(calls); for (const forbidden of ['DO_NOT_PUBLISH', 'token=secret', '/private/', f.old, 'private-token']) assert.equal(exported.includes(forbidden), false);
  assert.equal(publicSummary(m).previousCommitSha, 'a'.repeat(40));
});
test('retention preserves pending, running and recent records', (t) => {
  const f = fixture(t); const records = path.join(f.app, 'shared/deployments'); fs.mkdirSync(records);
  for (const [name, status, githubSync, finishedAt] of [['old', 'success', 'synced', '2020-01-01Z'], ['pending', 'failed', 'pending', '2020-01-01Z'], ['running', 'running', 'disabled', '2020-01-01Z'], ['recent', 'success', 'disabled', new Date().toISOString()]]) {
    const d = path.join(records, name); fs.mkdirSync(d); atomicJson(path.join(d, 'manifest.json'), { status, githubSync, finishedAt });
  }
  pruneRecords(records); assert.deepEqual(fs.readdirSync(records).sort(), ['pending', 'recent', 'running']);
});
