import path from 'node:path';
import { atomicJson, readJson, appendEvent, now, deploymentFinished, tryRecordLock } from './records.mjs';

// An explicit allowlist: paths, environment, error text and raw deploy logs never leave the host.
export function publicSummary(m) {
  const health = (value) => value ? Object.fromEntries(['local', 'public', 'version', 'frontend'].map((k) => [k, value[k] === true])) : null;
  return {
    deploymentId: m.deploymentId, commitSha: m.commitSha, artifactSha256: m.artifactSha256,
    startedAt: m.startedAt, finishedAt: m.finishedAt, status: m.status, phase: m.phase,
    previousDeploymentId: m.previousIdentity?.deploymentId || 'unknown',
    previousCommitSha: m.previousIdentity?.commitSha || 'unknown',
    health: health(m.health), rollbackStatus: m.rollbackStatus, rollbackHealth: health(m.rollbackHealth),
  };
}
export async function syncGithub(dir, { fetchImpl = fetch, env = process.env } = {}) {
  const file = path.join(dir, 'manifest.json');
  if (!env.DEPLOY_GITHUB_REPOSITORY || !deploymentFinished(readJson(file))) return false;
  const unlock = tryRecordLock(dir);
  if (!unlock) return false;
  try {
    const m = readJson(file);
    if (!deploymentFinished(m)) return false;
    if (m.githubSync === 'synced') return true;
    return await publishGithub(dir, file, m, fetchImpl, env);
  } finally { unlock(); }
}

async function publishGithub(dir, file, m, fetchImpl, env) {
  function saveGithubFields(fields) {
    const latest = readJson(file);
    atomicJson(file, { ...latest, ...fields });
  }
  saveGithubFields({ githubSync: 'pending' });
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(env.DEPLOY_GITHUB_REPOSITORY) || !env.DEPLOY_GITHUB_TOKEN || !/^[a-f0-9]{40}$/.test(m.commitSha || '')) throw new Error('github_configuration_missing');
    const base = `https://api.github.com/repos/${env.DEPLOY_GITHUB_REPOSITORY}`;
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.DEPLOY_GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' };
    async function api(url, body) {
      const r = await fetchImpl(url, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`github_http_${r.status}`);
      return r.json();
    }
    const summary = publicSummary(m);
    if (!m.githubDeploymentId) {
      // Reconcile an uncertain POST before creating again; payload ID makes retries identifiable.
      for (let page = 1; ; page++) {
        const deployments = await api(`${base}/deployments?sha=${m.commitSha}&environment=production&per_page=100&page=${page}`);
        const existing = deployments.find((d) => d.payload?.deploymentId === m.deploymentId);
        if (existing) { m.githubDeploymentId = existing.id; break; }
        if (deployments.length < 100) break;
      }
      if (!m.githubDeploymentId) {
        const deployment = await api(`${base}/deployments`, {
          ref: m.commitSha, environment: 'production', auto_merge: false, required_contexts: [],
          production_environment: true, transient_environment: false,
          description: `SoulSentry ${m.deploymentId}`.slice(0, 140), payload: summary,
        });
        if (!Number.isSafeInteger(deployment.id)) throw new Error('github_invalid_response');
        m.githubDeploymentId = deployment.id;
      }
      saveGithubFields({ githubDeploymentId: m.githubDeploymentId });
    }
    const state = m.status === 'success' ? 'success' : m.status === 'running' ? 'in_progress' : m.status === 'interrupted' ? 'error' : 'failure';
    const body = { state, environment: 'production', auto_inactive: false, description: `${m.deploymentId} ${m.status}; rollback ${m.rollbackStatus}`.slice(0, 140) };
    if (env.DEPLOY_PUBLIC_REPORT_URL) {
      const url = new URL(env.DEPLOY_PUBLIC_REPORT_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('github_report_url_invalid');
      body.log_url = url.href;
    }
    await api(`${base}/deployments/${m.githubDeploymentId}/statuses`, body);
    if (JSON.stringify(publicSummary(readJson(file))) !== JSON.stringify(summary)) {
      throw new Error('github_summary_changed');
    }
    saveGithubFields({ githubSync: 'synced', githubSyncedAt: now(), githubSyncError: undefined });
    appendEvent(dir, { phase: 'github_sync', status: 'success', githubDeploymentId: m.githubDeploymentId });
    return true;
  } catch (error) {
    // Never persist an upstream response, token, or arbitrary error body in public summaries.
    m.githubSyncError = /^(github_http_\d+|github_[a-z_]+)$/.test(error.message) ? error.message : 'github_sync_failed';
    saveGithubFields({ githubSync: 'pending', githubSyncError: m.githubSyncError });
    appendEvent(dir, { phase: 'github_sync', status: 'pending', reason: m.githubSyncError });
    return false;
  }
}
