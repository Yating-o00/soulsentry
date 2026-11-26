#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputArg = process.argv.indexOf('--output');
const output = path.resolve(outputArg >= 0 ? process.argv[outputArg + 1] : path.join(repo, 'release-artifacts'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Commit source changes (including untracked files) before building a release');
const commitSha = git('rev-parse', 'HEAD');
const builtAt = new Date().toISOString();
const stamp = builtAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const deploymentId = `prod-${stamp}-${commitSha.slice(0, 7)}-${randomUUID().slice(0, 8)}`;
const identity = { deploymentId, commitSha, builtAt };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'soulsentry-build-'));
try {
  const dist = path.join(temporary, 'dist');
  execFileSync('npm', ['run', 'build', '--', '--outDir', dist], {
    cwd: repo, stdio: 'inherit', env: { ...process.env, VITE_API_MODE: 'standalone', VITE_API_BASE_URL: '', SOULSENTRY_RELEASE_IDENTITY_JSON: JSON.stringify(identity) },
  });
  const actual = JSON.parse(fs.readFileSync(path.join(dist, 'release-identity.json'), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(identity)) throw new Error('Frontend identity was not emitted by Vite');
  fs.writeFileSync(path.join(temporary, 'release-identity.json'), JSON.stringify(identity, null, 2) + '\n');
  fs.mkdirSync(output, { recursive: true });
  const artifact = path.join(output, `${deploymentId}.tar.gz`);
  execFileSync('tar', ['-czf', artifact, '-C', temporary, 'release-identity.json', 'dist']);
  const sha = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  fs.writeFileSync(`${artifact}.sha256`, `${sha}  ${path.basename(artifact)}\n`);
  console.log(JSON.stringify({ ...identity, artifact, artifactSha256: sha }));
  const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
  console.log(`sudo ./deploy.sh --deployment-id ${deploymentId} --artifact ${quote(artifact)} --sha256 ${sha}`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
