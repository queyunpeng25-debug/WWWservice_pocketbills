# PocketBill

基于原型重建的 React + Firebase 账单管理网站。保留绿色视觉风格，提供桌面/手机布局、浅色/深色主题。网站内容为英文，方便课程展示。

## 1. 在 VS Code 中运行

用 VS Code 的 **File → Open Folder** 打开本项目文件夹 `Project`，不要直接双击 HTML，也不需要 Live Server 扩展。

前置条件：Node.js 22.12+（本项目使用 Node.js 24 验证）。打开 **Terminal → New Terminal**：

```powershell
npm install
npm run dev
```

打开终端显示的 Local 链接（默认 `http://127.0.0.1:5173/`）。点击 **Explore demo workspace**，即使没有 Firebase，也能体验账单新增、编辑、归档、恢复、搜索、分组、日历、付款与提醒。演示模式只保存在当前浏览器，不创建真实账号。刷新页面后重新进入 demo，数据仍在。

如果 PowerShell 阻止 npm.ps1，可用 `npm.cmd install` 和 `npm.cmd run dev`，不需要放宽系统执行策略。

## 2. 连接真实 Firebase

1. 在 [Firebase Console](https://console.firebase.google.com/) 创建你们自己的项目。
2. 注册 Web app，复制 Firebase config。
3. 在 **Authentication → Sign-in method** 启用 **Email/Password**。
4. 创建 **Cloud Firestore** 数据库，选择合适区域，使用 production mode。
5. 在项目根目录复制 `.env.example` 为 `.env.local`，填入四项 Web 配置：

```dotenv
VITE_FIREBASE_API_KEY=你的apiKey
VITE_FIREBASE_AUTH_DOMAIN=你的authDomain
VITE_FIREBASE_PROJECT_ID=你的projectId
VITE_FIREBASE_APP_ID=你的appId
```

6. 将 `firestore.rules` 的完整内容复制到 Firestore 的 **Rules** 页面并发布，或通过下一节 CLI 部署。不要改成允许所有读写。
7. 在 Authentication 的 authorized domains 中检查本地测试域名和正式 Hosting 域名；按需添加 `localhost` / `127.0.0.1`。
8. 停止并重新运行 `npm run dev`。入口会显示注册、登录、忘记密码功能。
9. 注册一个测试账号。新账号是空白工作区，演示数据不会导入真实账号。

这些是浏览器 Web SDK 配置，不能填写服务账号 JSON 或 Admin SDK 私钥。访问隔离依靠 Firebase Authentication 和 Firestore Rules，而不是隐藏 Web API key。

注册和密码由 Firebase Authentication 管理；显示名称、主题和提醒设置保存在 `users/{uid}`。首次保存偏好时创建 profile 文档；子集合可独立存在。

## 3. 部署到 Firebase Hosting

在项目终端执行（把 `YOUR_PROJECT_ID` 替换为真实项目 ID）：

```powershell
npx firebase-tools login
npm run build
npx firebase-tools deploy --project YOUR_PROJECT_ID --only "hosting,firestore:rules"
```

已有 `firebase.json`，不需要用 `firebase init` 覆盖它。部署前确保 `.env.local` 已填写；Vite 在构建时读取配置。终端会返回正式的 HTTPS 地址。部署后按 `docs/TESTING.md` 用两个测试账号验证隔离。

**当前交付不含 Firebase 项目账号、真实项目配置或线上部署。** 不提供这些配置时，完整本地演示可用，但不能进行真实注册或云端同步。

## 4. 已实现功能

- Firebase 邮箱注册、登录、退出和密码重置。
- 一次性、每月和每年账单；新增、编辑、归档、恢复。
- 按名称搜索，按周期、分类、群组筛选。
- 独立账期发票、付款/撤销付款、逾期状态、每月汇总。
- 月历切换、按日期查看付款、新建选中日期的账单。
- 应用打开时的逾期和即将到期提醒，支持 1/2/3/7/14 天。
- 仅本人可见的群组和成员姓名记录。
- 响应式布局、键盘操作、原生对话框、错误反馈、空状态、主题偏好。

金额以整数分保存，当前统一使用 EUR；日期采用本地 `YYYY-MM-DD`。31 日账单在短月份取最后一天，下一月份恢复原始日。闰年 2 月 29 日的年付账单在平年使用 2 月 28 日。

## 5. 账单规则与发票的区别

`BILL` 描述付款规则，`INVOICE` 描述一次实际账期。发票 ID 为 `billId_YYYY-MM-DD`。更改 11 月的付款状态不会改变 12 月。

打开应用会补齐账单起始月至本月的发票，并生成下月发票供跨月提醒；浏览其他月份也会生成该月发票。已有发票保存独立快照。编辑账单只影响尚未生成的月份，不覆盖既有发票的金额、名称或到期日。界面和 FAQ 中明确说明此行为。

归档停止生成新发票，并隐藏尚未付款的今天/未来发票；历史逾期和已付款记录保留。恢复后按原规则继续记账。网站不转账、不接入银行卡，不具备邮件自动提醒和文档提取功能。

## 6. 文件结构

```text
src/
  App.jsx          身份状态、页面、写入和发票生成
  AuthScreen.jsx   注册、登录、密码重置
  components.jsx   日历、发票列表、账单与群组表单
  views.jsx        账单管理、群组、设置与帮助
  domain.js        日期、重复规则、金额和业务验证
  firebase.js      Firebase 初始化
  store.js         Firestore / 演示数据存储
  styles.css       带注释的主题与响应式样式
tests/domain.test.js
scripts/validate.mjs
firestore.rules
firebase.json
docs/ARCHITECTURE.md
docs/TESTING.md
```

## 7. 检查与提交

```powershell
npm test
npm run validate
npm run check
npm run build
```

`npm run format` 会格式化源码。注释解释各模块职责和关键业务选择。`validate` 校验入口和 React 渲染的主要视图/表单 HTML，并解析 CSS 语法；它不是 W3C 官方认证。课程如要求 W3C 报告，请部署后提交页面 HTML 到 [Nu HTML Checker](https://validator.w3.org/nu/)，将 `src/styles.css` 上传到 [W3C CSS Validator](https://jigsaw.w3.org/css-validator/)。React 页面需检查渲染后的 DOM，而不只是只有 root 的入口 HTML。

Git 提交源码、配置模板和 `package-lock.json`；不提交 `node_modules`、`.env.local`、`dist`。如这是你们的新仓库，可执行 `git init`，然后通过 VS Code Source Control 提交，并连接你们自己的 GitHub 仓库。此交付未替你们创建远程仓库或推送代码。

Firebase 接口参考：[邮箱登录](https://firebase.google.com/docs/auth/web/password-auth)、[权限规则](https://firebase.google.com/docs/firestore/security/rules-conditions)、[Hosting](https://firebase.google.com/docs/hosting/)。
