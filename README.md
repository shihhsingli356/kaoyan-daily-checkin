# 考研每日打卡计划

一个静态网页版考研每日打卡工具，支持每日任务、阶段进度、月历复盘、学习时长、错题记录、深浅模式，以及 Supabase 云端同步。

## 使用方式

直接打开 `index.html` 即可使用。数据默认保存在当前浏览器本地。

## 云端同步

如需开启云同步：

1. 在 Supabase 创建项目。
2. 在 Supabase SQL Editor 执行 `supabase-checkin-schema.sql`。
3. 打开网页里的“云同步”面板。
4. 填入 Project URL 和 `anon public key`。
5. 注册或登录后即可自动同步整份打卡进度 JSON。

不要在网页里填写 `service_role` key。

## 部署

这是纯静态项目，可以部署到 Vercel、Cloudflare Pages、GitHub Pages 或任意静态服务器。
