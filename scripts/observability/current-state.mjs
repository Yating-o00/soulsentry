#!/usr/bin/env node
// Run ON the Linux server. Read-only; it never sources backend.env or prints logs.
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const attempt = fn => { try { return fn(); } catch { return null; } };
const command = (name, args) => attempt(() => execFileSync(name, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim());

export function safeIdentity(value) {
  return {
    deploymentId: typeof value?.deploymentId === 'string' && /^[\w.:-]{1,128}$/.test(value.deploymentId) ? value.deploymentId : null,
    commitSha: /^[a-f0-9]{40}$/.test(value?.commitSha || '') ? value.commitSha : null,
    builtAt: typeof value?.builtAt === 'string' && Number.isFinite(Date.parse(value.builtAt)) ? new Date(value.builtAt).toISOString() : null,
  };
}

// Values are consumed only for boolean checks. They never leave this function.
export function configurationPresence(text, separator = '\n') {
  const vars = new Map();
  for (const line of String(text).split(separator)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^["']/.test(value)) {
      const quote = value[0], end = value.lastIndexOf(quote);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else value = value.replace(/\s+#.*$/, '').trim();
    vars.set(match[1], value);
  }
  return {
    kimiKeyPresent: !!(vars.get('KIMI_API_KEY')?.trim() || vars.get('MOONSHOT_API_KEY')?.trim()),
    deepseekKeyPresent: !!vars.get('DEEPSEEK_API_KEY')?.trim(),
    experimentEnabled: vars.get('CHAT_AI_EXPERIMENT_ENABLED') === '1',
  };
}

const fileIdentity = path => attempt(() => safeIdentity(JSON.parse(readFileSync(path, 'utf8'))));
async function publicIdentity(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    const body = await response.json();
    return { httpStatus: response.status, ...safeIdentity(body) };
  } catch { return { httpStatus: null, ...safeIdentity(null) }; }
}

export async function collectState({ appRoot = '/opt/soulsentry', webRoot = '/var/www/soulsentry', service = 'soulsentry-backend', baseUrl = 'https://www.xinzhan-soulsentry.cn', port = '3000' } = {}) {
  const currentRelease = attempt(() => realpathSync(resolve(appRoot, 'current')));
  const pidText = command('systemctl', ['show', service, '--property=MainPID', '--value']);
  const pid = /^\d+$/.test(pidText || '') && Number(pidText) > 0 ? Number(pidText) : null;
  const cwd = pid ? attempt(() => realpathSync(`/proc/${pid}/cwd`)) : null;
  const env = pid ? attempt(() => readFileSync(`/proc/${pid}/environ`, 'utf8')) : null;
  const runtimeEnvFile = cwd ? attempt(() => readFileSync(resolve(cwd, '.env'), 'utf8')) : null;
  const sharedEnv = attempt(() => readFileSync(resolve(appRoot, 'shared/backend.env'), 'utf8'));
  const journal = command('journalctl', ['-u', service, '--since', '1 hour ago', '--no-pager', '-o', 'cat']);
  const counts = journal === null ? null : {
    chatAi: (journal.match(/\[chatAi\]/g) || []).length,
    aiAttempt: (journal.match(/\[aiAttempt\]/g) || []).length,
  };
  const [localVersion, publicVersion, publicFrontend] = await Promise.all([
    publicIdentity(`http://127.0.0.1:${port}/api/version`),
    publicIdentity(new URL('/api/version', baseUrl)),
    publicIdentity(new URL('/release-identity.json', baseUrl)),
  ]);
  const journalConfig = command('systemd-analyze', ['cat-config', 'systemd/journald.conf']);
  const retention = {};
  if (journalConfig !== null) for (const line of journalConfig.split('\n')) {
    const match = line.match(/^\s*(Storage|SystemMaxUse|SystemKeepFree|MaxRetentionSec|MaxFileSec)\s*=\s*([A-Za-z0-9.]+)\s*$/);
    if (match) retention[match[1]] = match[2];
  }
  let health = { httpStatus: null, ok: null };
  try {
    const r = await fetch(new URL('/api/health', baseUrl), { signal: AbortSignal.timeout(10000), redirect: 'error' });
    const body = await r.json();
    health = { httpStatus: r.status, ok: typeof body.ok === 'boolean' ? body.ok : null };
  } catch { /* Keep unknown; a timeout is not a negative health response. */ }
  return {
    schemaVersion: 1, observedAt: new Date().toISOString(),
    currentRelease,
    service: { name: service, activeState: command('systemctl', ['show', service, '--property=ActiveState', '--value']), pid,
      startedAt: command('systemctl', ['show', service, '--property=ExecMainStartTimestamp', '--value']), cwd,
      aiContextPresent: cwd ? existsSync(resolve(cwd, 'src/lib/aiContext.js')) : null,
      releaseIdentity: cwd ? fileIdentity(resolve(dirname(cwd), 'release-identity.json')) : null,
      startupEnvironmentPresence: env === null ? null : configurationPresence(env, '\0'),
      runtimeEnvironmentFile: runtimeEnvFile === null ? null : configurationPresence(runtimeEnvFile),
    },
    releaseIdentity: currentRelease ? fileIdentity(resolve(currentRelease, 'release-identity.json')) : null,
    frontendIdentity: fileIdentity(resolve(webRoot, 'release-identity.json')),
    localVersion, publicVersion, publicFrontend, health,
    sharedConfiguration: sharedEnv === null ? null : configurationPresence(sharedEnv),
    recentLogMarkers: { window: 'last 1 hour', counts },
    resources: { memory: command('free', ['-m']), disk: command('df', ['-h', appRoot]) },
    journal: { persistentDirectoryPresent: existsSync('/var/log/journal'), diskUsage: command('journalctl', ['--disk-usage']),
      configuredRetention: journalConfig === null ? null : retention,
      retentionDropInPresent: existsSync('/etc/systemd/journald.conf.d/soulsentry-observability.conf') },
    notes: ['null means unknown or unavailable, not verified failure or success', '/proc environment reflects startup and may omit dotenv changes; runtime .env and shared configuration are separate presence checks, not proof of effective in-memory configuration', 'Historical deployments without durable identity remain unknown', 'Private operational report: do not publish paths or raw logs to a public repository'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--help')) {
    process.stdout.write('Run on server: sudo node scripts/observability/current-state.mjs\nRead-only JSON to stdout. Does not reboot, deploy, modify configuration or display keys/log bodies.\n');
  } else collectState().then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(() => {
    process.stderr.write('Could not collect server state.\n'); process.exitCode = 1;
  });
}
