# 可查询的生产部署

部署只消费本地或 CI 构建的前端包，不在生产服务器运行 Vite，也不复用旧 `dist`。源代码、前端包与运行进程必须具有相同的完整 commit SHA 和部署 ID。脚本不修改业务数据库；schema 与上一 release 不同会停止，数据库迁移需要另行评审。

## 构建与发布

1. 提交全部源代码（包括新文件），在干净的目标 commit 上构建：

   ```bash
   npm ci
   npm run build:release -- --output /tmp/soulsentry-artifacts
   ```

   输出包名、部署 ID、SHA-256 和发布命令。构建强制 `VITE_API_MODE=standalone`、`VITE_API_BASE_URL=`，在临时目录构建；不修改工作区的 `dist`。`release-identity.json` 同时进入前端包和后端 release。

2. 将包上传到服务器，再让服务器源码切到输出中的完整 commit SHA。使用已有 SSH 或阿里云命令助手，不把长期凭据写入仓库。生产根目录已有的 `backend.env` 本地修改可保留：它被明确排除于源代码变更检查和 release 中，权威运行配置来自 `/opt/soulsentry/shared/backend.env`。其他已跟踪源码改动会阻止发布。

3. 在服务器源码仓库运行构建输出中的命令：

   ```bash
   sudo ./deploy.sh --deployment-id prod-YYYYMMDDTHHMMSSZ-COMMIT-UNIQUE \
     --artifact /tmp/prod-YYYYMMDDTHHMMSSZ-COMMIT-UNIQUE.tar.gz --sha256 SHA256
   ```

   `SKIP_FRONTEND_BUILD=0` 会被拒绝。包必须通过 SHA-256、路径与链接安全检查，包含 `index.html`、非空 `assets` 及一致的发布身份。重复部署 ID 会被拒绝，不覆盖旧记录；重试发布需要重新构建产生新 ID。

## 持久记录与验收

每次部署在 shared 中先写入私有目录（0700），再执行操作：

```text
/opt/soulsentry/shared/deployments/<deploymentId>/
  manifest.json   # 原子替换：完整 SHA、产物 SHA、操作者、UTC 时间、前后路径、阶段与结果
  events.jsonl    # 按阶段追加并 fsync
  deploy.log     # 私有 stdout/stderr；不上传公开 GitHub
```

采用原子目录锁及 PID/进程启动时间/系统 boot ID，避免并发部署；无法确认锁状态时停止发布。后端使用 systemd 重启；静态文件通过 rsync 校验内容同步，避免相同大小/时间戳误用旧入口。只有本地及公网健康检查、`/api/version` 和公网 `/release-identity.json` 均匹配部署身份才标记成功。

版本切换后出现任何失败，会恢复上一 symlink、完整前端文件及后端服务，再核验上一发布身份。回滚失败或历史 release 缺少身份时记录 `failed` / `unverified`，不会将 HTTP 200 当作版本证明。第一次引入版本接口的旧 release 可能无法完整验证回滚，需要人工检查。

```bash
sudo node scripts/deployment/status.mjs --reconcile
sudo node scripts/deployment/status.mjs prod-YYYYMMDDTHHMMSSZ-COMMIT-UNIQUE
```

`--reconcile` 只把进程已不存在或服务器已重启的遗留记录标为 `interrupted`、`needsVerification=true`，不改服务、不回滚、不猜测成功。SIGTERM/SIGHUP 会记录中断并尽可能回滚；SIGKILL/断电无法执行回滚。日志与记录保留 90 天；运行中、待核实或 GitHub 同步待重试的记录应保留。

锁遗留时不自动抢占。运维人员必须核对当前 symlink、本地及公网版本、服务健康、前端身份，保留检查证据，并处理该记录的 `needsVerification` 后，确认原部署进程不在运行才显式清理 `shared/deployment.lock`。不要仅凭旧 PID 或时间删除锁。这里故意阻止未经核实的后续部署，避免多个恢复操作交叉执行。

## 可公开的 GitHub 部署摘要

可选环境配置（通过运行时凭据注入或私有环境文件提供）：

```text
DEPLOY_GITHUB_REPOSITORY=Yating-o00/soulsentry
DEPLOY_GITHUB_TOKEN=<仅该仓库 Deployments: write 的短期/最小权限令牌>
DEPLOY_PUBLIC_REPORT_URL=https://example.org/reports/sanitized-report
```

脚本不从网页提取登录凭据，也不要求 GitHub 写入成功才能保留服务器记录。部署结束后，先落盘，再创建 `production` Deployment 并写入状态；只发送白名单摘要，包括部署 ID、完整 SHA、前后版本、UTC 时间、四项健康布尔值、结果及回滚状态。绝不发送运行目录、环境变量、异常正文或原始 deploy.log。可选报告 URL 必须是已脱敏的 HTTPS 地址，不得带凭据或查询参数。

同步失败留作 `pending`，手动重试：

```bash
sudo node scripts/deployment/status.mjs prod-YYYYMMDDTHHMMSSZ-COMMIT-UNIQUE --retry-github
sudo node scripts/deployment/status.mjs prod-YYYYMMDDTHHMMSSZ-COMMIT-UNIQUE --public
```

重试复用已保存的 GitHub deployment ID；若创建响应丢失，会按 SHA 和 payload 中的部署 ID 查询后复用。原始记录以服务器为准。未配置 GitHub 时显示 `disabled`；待配置后可重试已有完整记录。公开仓库需自行审阅公开报告内容，原始日志留在服务器。

API 参数依据 [GitHub Deployments](https://docs.github.com/en/rest/deployments/deployments#create-a-deployment) 与 [Deployment Statuses](https://docs.github.com/en/rest/deployments/statuses#create-a-deployment-status)，使用 Deployments 写权限，无需仓库源码写权限。

## 本地验证

```bash
node --test scripts/deployment/deploy.test.mjs
```

测试在临时 Git 仓库和发布目录中运行真实 orchestrator、tar、rsync；systemd/npm/curl 使用 fixture 命令，无生产访问。覆盖成功、包校验、身份不匹配、旧进程仍返回 200、部分静态发布、回滚失败、并发、SIGTERM、SIGKILL、脱敏及 GitHub 重试。进程存活检查需要允许读取本机子进程信息。
