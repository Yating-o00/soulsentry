# SoulSentry 微信小程序

基于 Taro 3 + React 18 的微信小程序前端，复用现有后端 `https://www.xinzhan-soulsentry.cn/api`。

## 目录结构

```
weapp/
├── config/             # Taro 构建配置
├── src/
│   ├── app.jsx         # 应用入口
│   ├── app.config.js   # 全局页面与 TabBar 配置
│   ├── app.scss        # 全局样式（主色 #384877）
│   ├── hooks/          # 通用 Hooks
│   ├── utils/          # API 封装、Auth 工具
│   └── pages/          # 页面
├── project.config.json # 微信小程序项目配置
├── package.json
└── babel.config.js
```

## 已包含页面

- `pages/index/index`：欢迎页（未登录时展示）
- `pages/login/index`：手机号验证码登录
- `pages/tasks/index`：约定列表
- `pages/task-detail/index`：约定详情、子约定、评论
- `pages/task-create/index`：新建约定
- `pages/notes/index`：心签列表
- `pages/note-detail/index`：心签详情、评论
- `pages/note-create/index`：新建心签
- `pages/share/index`：公开分享参与页（匿名勾选/评论/订阅/导入）
- `pages/account/index`：我的账户

## 环境要求

- Node.js 18+
- 微信开发者工具

## 安装

```bash
cd weapp
npm install
```

> 说明：Taro 3.6.35 默认拉取的 webpack 5 最新版本存在 ProgressPlugin 兼容性问题，项目已通过 `package.json` 中的 `overrides` 锁定 webpack 版本为 `5.78.0`。如果安装后构建仍报错，请删除 `node_modules` 和 `package-lock.json` 后重新执行 `npm install`。

## 开发

```bash
npm run dev:weapp
```

执行后会在 `weapp/dist` 目录生成小程序代码。用微信开发者工具打开 `weapp/dist` 目录即可预览。

## 生产构建

```bash
npm run build:weapp
```

构建产物位于 `weapp/dist`，可直接上传至微信小程序后台。

## 后端接口

所有接口均指向 `https://www.xinzhan-soulsentry.cn/api`，在 `config/index.js` 的 `defineConstants` 中配置。

## 部署检查清单

1. **替换 appid**：`project.config.json` 中的 `appid` 目前为 `touristappid`，请在微信开发者工具或小程序后台替换为自己的 appid。
2. **合法域名**：在微信小程序后台的「开发管理 -> 开发设置 -> 服务器域名」中将 `https://www.xinzhan-soulsentry.cn` 添加为 **request 合法域名**。
3. **HTTPS**：微信小程序要求请求域名使用有效 HTTPS 证书，且不支持 IP 和 localhost。
4. **CORS**：后端 `backend/src/app.js` 已增加对 `https://servicewechat.com` 来源的兼容。
5. **登录注册**：`/api/auth/login` 在手机号未注册时会自动创建账号，因此登录页无需单独调用注册接口。

## 分享页路径

分享二维码或链接可引导用户进入：

```
pages/share/index?token=<share_token>
```

登录后如需自动导入到个人列表，可附加 `autoImport=1`：

```
pages/share/index?token=<share_token>&autoImport=1
```
