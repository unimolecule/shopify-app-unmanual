# 文件模块

`apps/server` 的 file module 为当前 Shopify shop 提供文件上传、列表、元数据查询、下载与删除 REST 接口。数据库、bucket、下载和后台任务等 runtime 差异被收口在 capability/infra 里；multipart stream parser 是模块内通用业务逻辑。

## 接口

所有路由都注册在 `/{APP_API_PREFIX}/files` 下，并且需要 `shopifyAdminSession()`。

| 方法   | 路径                       | 响应                               |
| ------ | -------------------------- | ---------------------------------- |
| POST   | `/api/files`               | `201` JSON file 或 files list      |
| GET    | `/api/files`               | `200` JSON list，包含 `pagination` |
| GET    | `/api/files/{id}`          | `200` JSON file metadata           |
| GET    | `/api/files/{id}/download` | `200` stream 或 `302` redirect     |
| DELETE | `/api/files/{id}`          | `204` empty response               |

`GET /api/files/{id}/download` 会直接下载文件。模块不提供独立的“获取下载链接”接口。

## 列表分页

`GET /api/files` 支持 cursor 和 page 两种分页模式，但同一次请求不能同时传 `cursor` 与 `page`。`limit` 默认使用服务端列表默认页大小，最大值为 `100`；超过 `100` 会在 query validation 阶段返回 `400`。Page 模式只允许浅页导航，当前 `page` 最大为 `50`，有效 offset 上限为 `5000`；更深的翻页会返回 `400`，调用方应改用服务端返回的 `nextCursor`。

Cursor 模式适合“加载更多”：

```text
GET /api/files?limit=20&cursor=<nextCursor>
```

Page 模式适合后台表格的浅页跳转：

```text
GET /api/files?limit=20&page=2
```

响应把资源集合统一放在 `data.result`，把分页信息放在 `data.pagination`。Cursor 是服务端生成的 opaque seek cursor，客户端只应原样传回，不应自行拼接：

```json
{
  "data": {
    "result": [],
    "pagination": {
      "mode": "cursor",
      "limit": 20,
      "nextCursor": "8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a",
      "hasNext": true
    }
  }
}
```

Page 模式会额外返回 `total`，表示当前 query 条件下的资源总数。

## 上传模式

Raw upload：

```text
POST /api/files
Content-Type: application/pdf
X-File-Name: invoice.pdf
```

Multipart upload：

```text
POST /api/files
Content-Type: multipart/form-data
fields: files or files[]
```

Multipart 解析当前由 `apps/server/src/app/modules/file/upload-stream-parser/index.ts` 使用 `formidable@4.0.0-rc.6` 的 Fetch `Request` API 完成。当前 `/api/files` 只接受文件字段 `files` / `files[]`，普通表单字段应在文件上传成功后通过业务接口单独提交。

配置：

| Env                             | 默认值  | 说明                                |
| ------------------------------- | ------- | ----------------------------------- |
| `APP_FILE_MAX_SIZE`             | `10MB`  | 单个上传文件的最大字节数            |
| `APP_FILE_UPLOAD_MULTIPLE_SIZE` | `10`    | 单次 multipart 上传允许的最大文件数 |
| `APP_FILE_UPLOAD_TIMEOUT`       | `5min`  | 上传请求超时时间                    |
| `APP_FILE_EXPIRE`               | `24h`   | 文件过期时间                        |
| `APP_FILE_DIR`                  | `files` | process memory bucket 目录名        |

同一次请求上传的多个文件会共享一个生成的 batch directory ID，但每个文件仍然拥有独立的 file resource ID。

## 文件记录

公开响应包含：

- `id`
- `originalName`
- `safeName`
- `contentType`
- `byteSize`
- `status`
- `expiresAt`
- `createdAt`
- `updatedAt`

内部 `FileRecord` 还保存 `shopDomain`、`bucketProvider`、`bucketKey` 和可选的 `deletedAt`。`shopDomain` 始终参与 lookup、list、download 和 delete 操作。

状态：

- `uploading`
- `available`
- `expired`
- `deleted`
- `failed`

## 存储 Key

模块会清洗用户文件名，并按下面的格式生成 bucket key：

```text
{shopDomain}/{yyyy}/{mm}/{fileOrBatchId}/{safeName}
```

类似 `import-report-2026-06-03-112151.csv` 的时间戳后缀会被移除，最终得到更稳定的名字，例如 `import-report.csv`。路径分隔符、控制字符、连续空白、全点文件名和超长文件名都会在写入前被规范化。

## 数据库

文件元数据通过 Drizzle-backed files repository 存储：

```text
apps/server/src/app/modules/file/repositories/database/index.ts
apps/server/src/app/modules/file/repositories/database/postgres.ts
apps/server/src/app/modules/file/repositories/database/sqlite.ts
apps/server/src/app/modules/file/repositories/database/shared.ts
packages/database/src/models/postgres/files.ts
packages/database/src/models/sqlite/files.ts
```

`index.ts` 按 Drizzle database kind 分发 PostgreSQL 或 SQLite/D1 store；`postgres.ts` 与 `sqlite.ts` 放置 dialect-specific 查询；`shared.ts` 放置分页转换、cursor 读取和 page offset 等跨 dialect 逻辑。列表查询会多取一条记录判断 `hasNext`；page 模式额外执行 `count` 返回 `total`，cursor 模式不计算总数以避免深翻页带来的额外扫描。

当前 provider 规则：

| Runtime      | `APP_DATABASE_PROVIDER` | 实现                                    |
| ------------ | ----------------------- | --------------------------------------- |
| `node`       | `postgres`              | `pg.Pool` + `drizzle-orm/node-postgres` |
| `cloudflare` | `d1`                    | Cloudflare D1 + `drizzle-orm/d1`        |

Node PostgreSQL 需要 `APP_DATABASE_URL`。Cloudflare D1 需要 `APP_DATABASE_D1_BINDING` 指向的 D1 binding。PostgreSQL migration 使用 `apps/server/drizzle.pg.config.ts` 与 `apps/server/drizzle.pg`，D1 migration 使用 `apps/server/drizzle.d1.config.ts` 与 `apps/server/drizzle.d1`。

常用数据库命令：

```bash
pnpm --dir apps/server run db:generate:pg
pnpm --dir apps/server run db:generate:d1
pnpm --dir apps/server run db:migrate:pg
pnpm --dir apps/server run db:migrate:d1
pnpm --dir apps/server run db:seed:dev:pg
pnpm --dir apps/server run db:seed:dev:d1
```

`db:seed:dev:pg` 会通过 `scripts/database/seed.pg.ts` 写入一条 Shopify offline session 和一条 file metadata。`db:seed:dev:d1` 会通过 `scripts/database/seed.d1.ts` 调用 Wrangler D1 写入远端 development D1；显式本地 Wrangler D1 调试可临时设置 `D1_SEED_LOCAL=true` 后复用同一命令。

## Runtime Capabilities

file module 使用这些 runtime capabilities：

| Capability                                          | 作用                                 |
| --------------------------------------------------- | ------------------------------------ |
| `runtimeCapabilities.database.repositories.files()` | 创建当前 runtime 的 files repository |
| `runtimeCapabilities.bucket()`                      | 创建通用 object bucket               |
| `runtimeCapabilities.file.downloadResolver()`       | 解析 stream 或 redirect 下载         |

file module 会在业务逻辑内通过 `runtimeCapabilities.database.repositories.files()` 获取 Drizzle-backed files repository。Node runtime 在 capability creator 中绑定 PostgreSQL repository；Cloudflare runtime 在 capability creator 中绑定 SQLite/D1 repository。Node 当前支持 PostgreSQL database、memory/R2 bucket、memory stream / R2 signed redirect 下载 resolver。

Cloudflare 当前通过 request-scoped capabilities 使用 D1 database、R2 binding bucket 和 R2 signed redirect 下载 resolver。development 的 R2 binding 需要与 D1 一样保持 `remote: true`，否则写入会进入 Wrangler 本地 R2 模拟，但下载 resolver 生成的 signed URL 会指向远端 R2，最终表现为业务接口成功而 R2 返回 `NoSuchKey`。file module 当前没有模块专属后台 dispatcher；后续过期清理、对象删除重试等后台工作应注册到通用 queue/scheduler infra。

## 下载与删除

下载前会先调用 `getAvailableFile`。不存在、已删除、非 available 状态或跨 shop 的文件都会返回 not found。过期文件会被标记为 `expired` 并返回 gone。

下载行为：

| Runtime      | Provider | 行为                  |
| ------------ | -------- | --------------------- |
| `node`       | `memory` | `200` stream          |
| `node`       | `r2`     | `302` signed redirect |
| `cloudflare` | `r2`     | `302` signed redirect |

Memory download 返回：

```text
Content-Type: <file.contentType>
Content-Length: <object.byteSize>
Content-Disposition: attachment; filename*=UTF-8''<encoded originalName>
Cache-Control: private, no-store
```

R2 download 返回 `300000ms` 短期 SigV4 signed URL redirect，并在签名 query 中带上 `response-content-type` 与 `response-content-disposition`。Node 与 Cloudflare runtime 共用同一套 Web Crypto signer；没有 signed URL signer 的 provider 才返回与 memory download 相同的私有 stream response。

删除时会先删除 bucket object，然后把数据库记录标记为 `deleted`。

## 当前边界

- 后台过期清理尚未实现。
- file module 的 Cloudflare Queue-backed background tasks 尚未实现。
- R2 custom-domain signed download 尚未实现。当前 R2 provider 返回 S3-compatible endpoint 的短期签名 URL。
- Multipart 解析当前只支持文件字段，不接收普通表单字段。

## 测试

常用聚焦检查：

```bash
pnpm --dir apps/server exec vitest run \
  tests/file-service.test.ts \
  tests/file-download-runtime-capability.test.ts \
  tests/file-upload-stream-parser.test.ts \
  tests/process-memory-bucket.test.ts \
  tests/isolate-s3-compatible-bucket.test.ts
```
