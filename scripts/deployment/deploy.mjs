#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { atomicJson, readJson, appendEvent, now, processIdentity, acquireLock, reconcile, pruneRecords } from './records.mjs';
import { syncGithub } from './github.mjs';

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appRoot = path.resolve(process.env.APP_ROOT || '/opt/soulsentry');
const shared = path.resolve(process.env.SHARED_DIR || path.join(appRoot, 'shared'));
const records = path.join(shared, 'deployments');
const releases = path.resolve(process.env.RELEASES_DIR || path.join(appRoot, 'releases'));
const current = path.resolve(process.env.CURRENT_LINK || path.join(appRoot, 'current'));
const webRoot = path.resolve(process.env.WEB_ROOT || '/var/www/soulsentry');
const sharedEnv = path.resolve(process.env.SHARED_ENV || path.join(shared, 'backend.env'));
const service = process.env.SERVICE_NAME || 'soulsentry-backend';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) options[process.argv[i]] = process.argv[i + 1];
const deploymentId = options['--deployment-id'] || process.env.DEPLOYMENT_ID;
if (!deploymentId || !/^prod-\d{8}T\d{6}Z-[a-zA-Z0-9-]{7,80}$/.test(deploymentId)) {
  console.error('Usage: deploy.sh --deployment-id prod-YYYYMMDDTHHMMSSZ-<unique> --artifact /path/release.tar.gz --sha256 <64 hex>');
  process.exit(64);
}
process.umask(0o077);
fs.mkdirSync(records, { recursive: true, mode: 0o700 });
const dir = path.join(records, deploymentId);
try { fs.mkdirSync(dir, { mode: 0o700 }); }
catch { console.error('Deployment ID already exists; never overwrite a deployment record'); process.exit(65); }
const manifestFile = path.join(dir, 'manifest.json');
const target = path.join(releases, `release-${deploymentId}`);
let sourceSha = null;
try { sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(); } catch { /* Record the failed attempt even without Git. */ }
const manifest = {
  schemaVersion: 1, deploymentId, commitSha: sourceSha, artifactSha256: null,
  actor: process.env.DEPLOY_ACTOR || process.env.SUDO_USER || process.env.USER || 'unknown',
  startedAt: now(), finishedAt: null, previousRelease: null, targetRelease: target,
  phase: 'start', status: 'running', rollbackStatus: 'not_required',
  process: processIdentity(), health: {}, githubSync: process.env.DEPLOY_GITHUB_REPOSITORY ? 'pending' : 'disabled',
};
atomicJson(manifestFile, manifest);
const logFile = fs.openSync(path.join(dir, 'deploy.log'), 'a', 0o600);
let unlock, stage, child, interrupted = false, switched = false, shuttingDown = false;
function update(patch, event = {}) {
  Object.assign(manifest, patch);
  atomicJson(manifestFile, manifest);
  appendEvent(dir, { phase: manifest.phase, status: manifest.status, ...event });
}
function log(message) {
  const line = `[${now()}] ${message}\n`;
  fs.writeSync(logFile, line);
  process.stdout.write(line);
}
function phase(name) { update({ phase: name }); log(name); }
function run(command, args, { capture = false, cwd = repo, allowInterrupted = false } = {}) {
  if (interrupted && !allowInterrupted) throw new Error('Deployment interrupted');
  return new Promise((resolve, reject) => {
    let result = '';
    child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const running = child;
    running.stdout.on('data', (data) => { fs.writeSync(logFile, data); if (capture) result += data; });
    running.stderr.on('data', (data) => fs.writeSync(logFile, data));
    running.once('error', reject);
    running.once('close', (code, signal) => {
      if (child === running) child = null;
      if (code === 0 && (!interrupted || allowInterrupted)) resolve(result);
      else reject(new Error(`${command} failed (exit ${code ?? signal})`));
    });
  });
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {
  if (shuttingDown) return;
  interrupted = true;
  child?.kill('SIGTERM');
});
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function identity(file) {
  const x = readJson(file);
  if (!x || !/^prod-\d{8}T\d{6}Z-[a-zA-Z0-9-]{7,80}$/.test(x.deploymentId)
    || !/^[a-f0-9]{40}$/.test(x.commitSha) || !Number.isFinite(Date.parse(x.builtAt))) throw new Error('Invalid release identity');
  return { deploymentId: x.deploymentId, commitSha: x.commitSha, builtAt: x.builtAt };
}
function sameIdentity(a, b) { return ['deploymentId', 'commitSha', 'builtAt'].every((k) => a[k] === b[k]); }
function removeRuntimeFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if ((/(^|\.)env($|\.)/.test(entry.name) && !entry.name.endsWith('.example')) || /\.(pem|key|log)$/.test(entry.name)) {
      fs.rmSync(file, { recursive: true, force: true });
    } else if (entry.isDirectory()) removeRuntimeFiles(file);
  }
}
async function curlJson(url) {
  const result = await run('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '12', url], { capture: true, allowInterrupted: shuttingDown });
  try { return JSON.parse(result); } catch { throw new Error('Health/version response was not JSON'); }
}
async function verify(expected, rollback = false) {
  const local = `http://127.0.0.1:${process.env.BACKEND_PORT || '3000'}`;
  const publicHealth = process.env.PUBLIC_HEALTH_URL || 'https://xinzhan-soulsentry.cn/api/health';
  const publicBase = new URL(publicHealth).origin;
  const health = { local: false, public: false, version: false, frontend: false };
  try {
    for (let retry = 0; retry < 5; retry++) {
      try { if ((await curlJson(`${local}/api/health`)).ok === true) { health.local = true; break; } } catch { /* Allow service startup. */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!health.local) throw new Error('Local health check failed');
    health.public = (await curlJson(publicHealth)).ok === true;
    if (!health.public) throw new Error('Public health check failed');
    if (!expected) throw new Error('Previous release has no identity; rollback requires manual version verification');
    const version = await curlJson(`${local}/api/version`);
    const publicVersion = await curlJson(`${publicBase}/api/version?deploymentId=${encodeURIComponent(expected.deploymentId)}`);
    health.version = sameIdentity(expected, version) && sameIdentity(expected, publicVersion);
    if (!health.version) throw new Error('Running backend identity does not match expected release');
    const front = await curlJson(`${publicBase}/release-identity.json?deploymentId=${encodeURIComponent(expected.deploymentId)}`);
    health.frontend = sameIdentity(expected, front);
    if (!health.frontend) throw new Error('Published frontend identity does not match expected release');
    return health;
  } finally { update({ [rollback ? 'rollbackHealth' : 'health']: health }); }
}
function replaceCurrent(release) {
  const temporary = `${current}.${randomUUID()}.tmp`;
  fs.symlinkSync(release, temporary);
  fs.renameSync(temporary, current);
}
async function restart() {
  await run('systemctl', ['daemon-reload'], { allowInterrupted: shuttingDown });
  await run('systemctl', ['restart', service], { allowInterrupted: shuttingDown });
  await run('systemctl', ['is-active', '--quiet', service], { allowInterrupted: shuttingDown });
}
async function publish(release) {
  await run('rsync', ['-a', '--checksum', '--delete', `${release}/dist/`, `${webRoot}/`], { allowInterrupted: shuttingDown });
}
try {
  if (!manifest.process) throw new Error('Cannot inspect deployment process identity; refusing to acquire lock');
  unlock = acquireLock(shared, { ...manifest.process, token: randomUUID(), deploymentId });
  reconcile(records);
  const unresolved = fs.readdirSync(records).some((name) => {
    try { const m = readJson(path.join(records, name, 'manifest.json')); return m.needsVerification === true; }
    catch { return false; }
  });
  if (unresolved) throw new Error('Previous interrupted or failed rollback deployment requires verification; inspect records before deploying again');
  if (process.env.SKIP_FRONTEND_BUILD && process.env.SKIP_FRONTEND_BUILD !== '1') throw new Error('Production frontend builds are disabled; upload a prebuilt artifact');
  phase('validate_artifact');
  const artifact = path.resolve(options['--artifact'] || process.env.DEPLOY_ARTIFACT || '');
  const expectedSha = options['--sha256'] || process.env.DEPLOY_ARTIFACT_SHA256 || '';
  if (!/^[a-f0-9]{64}$/.test(expectedSha) || !fs.statSync(artifact).isFile()) throw new Error('Artifact file and SHA-256 are required');
  manifest.artifactSha256 = digest(artifact);
  update({ artifactSha256: manifest.artifactSha256 });
  if (manifest.artifactSha256 !== expectedSha) throw new Error('Artifact SHA-256 mismatch');
  const listing = await run('tar', ['-tzf', artifact], { capture: true });
  const verbose = await run('tar', ['-tvzf', artifact], { capture: true });
  for (const line of verbose.trim().split('\n')) if (!['-', 'd'].includes(line[0])) throw new Error('Artifact links and special files are forbidden');
  for (const entry of listing.trim().split('\n')) {
    const normalized = entry.replace(/^\.\//, '');
    if (normalized.startsWith('/') || normalized.split('/').includes('..') || normalized.includes('\\')
      || !(normalized === 'release-identity.json' || normalized === 'dist' || normalized.startsWith('dist/'))) throw new Error('Unsafe artifact entry');
  }
  stage = fs.mkdtempSync(path.join(shared, '.artifact-'));
  await run('tar', ['-xzf', artifact, '-C', stage]);
  const releaseIdentity = identity(path.join(stage, 'release-identity.json'));
  const frontIdentity = identity(path.join(stage, 'dist/release-identity.json'));
  if (releaseIdentity.deploymentId !== deploymentId || !sameIdentity(releaseIdentity, frontIdentity)) throw new Error('Artifact identity mismatch');
  if (!fs.statSync(path.join(stage, 'dist/index.html')).isFile() || !fs.statSync(path.join(stage, 'dist/assets')).isDirectory()
    || fs.readdirSync(path.join(stage, 'dist/assets')).length === 0) throw new Error('Artifact must include index.html and assets');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  if (releaseIdentity.commitSha !== sha) throw new Error('Source HEAD does not match artifact commit');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude)backend.env'], { cwd: repo, encoding: 'utf8' });
  if (dirty.trim()) throw new Error('Tracked source changes must be committed before deployment');
  const previous = fs.realpathSync(current);
  if (!fs.lstatSync(current).isSymbolicLink() || !fs.statSync(path.join(previous, 'dist/index.html')).isFile()) throw new Error('Previous release must be available for rollback');
  let previousIdentity = null;
  try { previousIdentity = identity(path.join(previous, 'release-identity.json')); } catch { /* Historic releases may predate identity. */ }
  update({ commitSha: sha, previousRelease: previous, previousIdentity });
  if (!fs.statSync(sharedEnv).isFile()) throw new Error('Missing shared backend environment');
  phase('prepare_release');
  fs.mkdirSync(releases, { recursive: true });
  fs.mkdirSync(target);
  // Only committed source files enter a release. No local env, uploads, keys or raw logs.
  const sourceTar = path.join(stage, 'source.tar');
  await run('git', ['archive', '--format=tar', '--output', sourceTar, sha]);
  await run('tar', ['-xf', sourceTar, '-C', target]);
  removeRuntimeFiles(target);
  fs.rmSync(path.join(target, 'dist'), { recursive: true, force: true });
  fs.cpSync(path.join(stage, 'dist'), path.join(target, 'dist'), { recursive: true });
  atomicJson(path.join(target, 'release-identity.json'), releaseIdentity);
  fs.copyFileSync(sharedEnv, path.join(target, 'backend/.env'));
  fs.chmodSync(path.join(target, 'backend/.env'), 0o600);
  const oldSchema = path.join(previous, 'backend/prisma/schema.prisma');
  if (digest(oldSchema) !== digest(path.join(target, 'backend/prisma/schema.prisma'))) throw new Error('Schema changes require a separately reviewed migration; deploy does not mutate the database');
  const uploads = path.join(shared, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  const oldUploads = path.join(previous, 'backend/uploads');
  if (fs.existsSync(oldUploads) && !fs.lstatSync(oldUploads).isSymbolicLink()) await run('rsync', ['-a', `${oldUploads}/`, `${uploads}/`]);
  fs.rmSync(path.join(target, 'backend/uploads'), { recursive: true, force: true });
  fs.symlinkSync(uploads, path.join(target, 'backend/uploads'));
  await run('npm', ['--prefix', path.join(target, 'backend'), 'ci']);
  await run('npm', ['--prefix', path.join(target, 'backend'), 'run', 'prisma:generate']);
  if (interrupted) throw new Error('Deployment interrupted');
  phase('switch_release');
  switched = true; // A partially failed publish also requires frontend rollback.
  replaceCurrent(target);
  fs.mkdirSync(webRoot, { recursive: true });
  await publish(target);
  phase('restart_backend');
  await restart();
  phase('verify');
  await verify(releaseIdentity);
  if (interrupted) throw new Error('Deployment interrupted');
  update({ phase: 'complete', status: 'success', finishedAt: now(), exitCode: 0 });
  log('Deployment succeeded; backend and frontend identities verified');
} catch (error) {
  shuttingDown = true;
  const failurePhase = manifest.phase;
  log(error.message);
  update({ failurePhase, failureReason: error.message, status: interrupted ? 'interrupted' : 'failed', exitCode: interrupted ? 130 : 1 });
  if (switched && manifest.previousRelease) {
    update({ phase: 'rollback', rollbackStatus: 'running' });
    try {
      replaceCurrent(manifest.previousRelease);
      await publish(manifest.previousRelease);
      await restart();
      await verify(manifest.previousIdentity, true);
      update({ rollbackStatus: 'success', rollbackRelease: manifest.previousRelease });
    } catch (rollbackError) {
      update({ rollbackStatus: manifest.previousIdentity ? 'failed' : 'unverified', rollbackReason: rollbackError.message, needsVerification: true });
      log(`Rollback requires attention: ${rollbackError.message}`);
    }
  }
  update({ finishedAt: now() });
  process.exitCode = interrupted ? 130 : 1;
} finally {
  shuttingDown = true;
  if (stage) fs.rmSync(stage, { recursive: true, force: true });
  if (unlock) unlock();
  // Local facts survive even if GitHub is unavailable. Sync receives no raw command output.
  if (manifest.githubSync === 'pending') await syncGithub(dir).catch(() => {});
  pruneRecords(records);
  fs.closeSync(logFile);
}
