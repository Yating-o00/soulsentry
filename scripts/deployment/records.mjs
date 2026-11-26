import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const now = () => new Date().toISOString();
export function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function processIdentity(pid = process.pid) {
  try {
    const bootId = fs.existsSync('/proc/sys/kernel/random/boot_id')
      ? fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() : 'local';
    const startToken = fs.existsSync(`/proc/${pid}/stat`)
      ? fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1).split(' ')[19]
      : execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' }).trim();
    if (!startToken) return null;
    return { pid, bootId, startToken };
  } catch { return null; }
}
export function isAlive(owner) {
  if (!owner?.pid || !owner?.startToken) return false;
  const current = processIdentity(owner.pid);
  if (current) return current.bootId === owner.bootId && current.startToken === owner.startToken;
  try { process.kill(owner.pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}
export function appendEvent(dir, event) {
  const fd = fs.openSync(path.join(dir, 'events.jsonl'), 'a', 0o600);
  try { fs.writeSync(fd, JSON.stringify({ time: now(), ...event }) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
export function deploymentFinished(m) {
  return ['success', 'failed', 'interrupted'].includes(m.status)
    && Boolean(m.finishedAt) && m.rollbackStatus !== 'running';
}

// A generation is advanced only after its owner is dead. Leaving that stale inode
// in place prevents a competing retry from deleting a newly acquired owner's lock.
export function tryRecordLock(dir) {
  const owner = processIdentity();
  if (!owner) throw new Error('Cannot inspect deployment record lock owner');
  const candidate = path.join(dir, `.record-owner-${randomUUID()}`);
  atomicJson(candidate, { ...owner, token: randomUUID() });
  try {
    for (let generation = 0; ; generation++) {
      const lock = path.join(dir, `.record-${generation}.lock`);
      try {
        fs.linkSync(candidate, lock);
        return () => fs.unlinkSync(lock);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      try {
        const holder = readJson(lock);
        if (isAlive(holder)) return null;
        // A process can release its slot and then exit between read and liveness check.
        // Its unique token must still own this slot before we skip the dead generation.
        if (readJson(lock).token !== holder.token) generation--;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        generation--; // Released between link and read. Compete for the same slot.
      }
    }
  } finally { fs.unlinkSync(candidate); }
}
export function reconcile(recordsDir) {
  const interrupted = [];
  if (!fs.existsSync(recordsDir)) return interrupted;
  for (const entry of fs.readdirSync(recordsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(recordsDir, entry.name);
    try {
      const file = path.join(dir, 'manifest.json');
      const initial = readJson(file);
      if (deploymentFinished(initial) || isAlive(initial.process)) continue;
      const unlock = tryRecordLock(dir);
      if (!unlock) continue;
      try {
        // The owner may have finished just before its death was observed.
        const m = readJson(file);
        if (deploymentFinished(m) || isAlive(m.process)) continue;
        Object.assign(m, { status: 'interrupted', finishedAt: now(), rollbackStatus: 'unknown', needsVerification: true, githubSync: m.githubSync === 'disabled' ? 'disabled' : 'pending' });
        atomicJson(path.join(dir, 'manifest.json'), m);
        appendEvent(dir, { phase: m.phase, status: m.status, reason: 'process_not_running_or_host_restarted' });
        interrupted.push(m.deploymentId);
      } finally { unlock(); }
    } catch { /* An incomplete record is never a successful deployment. */ }
  }
  return interrupted;
}
export function acquireLock(sharedDir, owner) {
  const lock = path.join(sharedDir, 'deployment.lock');
  {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      atomicJson(path.join(lock, 'owner.json'), owner);
      return () => {
        try {
          if (readJson(path.join(lock, 'owner.json')).token === owner.token) fs.rmSync(lock, { recursive: true });
        } catch { /* Preserve locks whose ownership cannot be proven. */ }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing;
      try { existing = readJson(path.join(lock, 'owner.json')); }
      catch { throw new Error('Deployment lock has no readable owner; inspect it before removing it'); }
      if (isAlive(existing)) throw new Error('Another deployment is running');
      // Never automatically reap: two contenders could otherwise rename a newly acquired lock.
      throw new Error('Stale deployment lock; reconcile records and verify the running release before explicit operator removal');
    }
  }
}
export function pruneRecords(recordsDir, retentionDays = 90) {
  const cutoff = Date.now() - retentionDays * 86400000;
  const expired = m => deploymentFinished(m) && !m.needsVerification
    && m.githubSync !== 'pending' && Date.parse(m.finishedAt) < cutoff;
  for (const e of fs.readdirSync(recordsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(recordsDir, e.name);
    try {
      const file = path.join(dir, 'manifest.json');
      if (!expired(readJson(file))) continue;
      const unlock = tryRecordLock(dir);
      if (!unlock) continue;
      if (expired(readJson(file))) fs.rmSync(dir, { recursive: true });
      else unlock();
    } catch { /* Preserve unknown/incomplete records for inspection. */ }
  }
}
