# 远端开发存储工作流

`apps/server` 的常规开发工作流使用远端 development 存储资源：

| 环境          | D1 数据库           | R2 bucket           |
| ------------- | ------------------- | ------------------- |
| `development` | 远端 development D1 | 远端 development R2 |
| `production`  | 远端 production D1  | 远端 production R2  |

这样 Cloudflare D1/R2 与 Node R2 的开发行为保持一致。Node + R2 通过 S3-compatible API 访问远端资源；Cloudflare Worker development binding 也通过 `remote: true` 访问远端 development D1 和 R2。

## 决策

默认使用远端 development D1 和 R2。

Wrangler 生成器会给非 production 的 Cloudflare D1/R2 binding 写入 `remote: true`。当 `APP_ENV=development` 时，本地 `wrangler dev` 会读写 development D1 和 R2，而不是创建独立的本地 `.wrangler` 存储。

Production 不需要这个开关，因为部署后的 Worker 本身就在 Cloudflare 上访问远端 D1/R2。

## 原因

这个 app 会把 Shopify session、file metadata 和 product export 状态写入数据库，也会把上传文件、导出 part 和最终 `products.csv` 写入 R2。这些记录和对象属于真实 Shopify app 联调流程，尤其是 OAuth、token exchange、文件下载和依赖 Admin API 的资源路由。

默认使用远端 development 存储可以避免这些错位：

- Cloudflare development 误读本地 D1，而 migration/seed 写在远端 D1。
- Cloudflare development 把导出 CSV 写进本地 R2 模拟，但 download 签出远端 R2 URL，导致远端返回 `NoSuchKey`。
- `db:push:d1` 更新了远端 D1，但 `wrangler dev` 仍然因为本地表缺失报错。
- seed 数据写在一份 D1 里，但当前 runtime 读取另一份 D1。

代价是 development 数据会共享在远端 development D1/R2 中。不要把 development env file 指向 production D1 或 production R2。

## 常规开发

重新生成平台配置：

```bash
pnpm dev:prepare
```

schema 变更后同步远端 development D1：

```bash
pnpm --dir apps/server run db:push:d1
```

只有需要样例记录时才写入 development seed：

```bash
pnpm --dir apps/server run db:seed:dev:d1
```

然后启动 app：

```bash
pnpm dev:tunnel
```

## 本地存储调试

只有明确需要隔离的 Wrangler 本地存储时才使用本地 D1/R2。

先从生成的 development D1/R2 binding 中临时移除 `remote: true`，或使用等价的临时 Wrangler config。然后对本地 D1 binding 执行 migration：

```bash
pnpm --dir apps/server exec wrangler d1 migrations apply i7eo_shopify_app_dev_d1 --env development --local
```

如果需要向本地 D1 写 seed，不额外添加 package script，直接临时设置 `D1_SEED_LOCAL=true` 后复用 development seed 命令：

```bash
D1_SEED_LOCAL=true pnpm --dir apps/server run db:seed:dev:d1
```

本地 D1/R2 数据位于 `.wrangler/`，只适合调试，可以丢弃，不是 canonical development storage。

## Production

Production 使用 production env file 和远端 production D1/R2。部署前先执行已生成的 D1 migration：

```bash
pnpm --dir apps/server run db:migrate:d1
```

Production seed 不是常规部署步骤。只有明确需要初始化生产数据，并确认插入行确实属于生产环境时才执行：

```bash
pnpm --dir apps/server run db:seed:prod:d1
```
