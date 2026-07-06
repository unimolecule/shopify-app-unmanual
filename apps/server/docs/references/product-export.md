# Product Export Module

`apps/server` 的 product-export module 为当前 Shopify shop 提供产品 CSV 导出的创建、列表、元数据查询、下载与删除接口。导出任务通过 Shopify Bulk Operation 和 app queue 后台流程完成；HTTP resource 只暴露导出 job 与生成文件的状态。

## 接口

所有路由都注册在 `/{APP_API_PREFIX}/product-exports` 下，并且需要 `shopifyAdminSession()`。

| 方法   | 路径                                       | 响应                                |
| ------ | ------------------------------------------ | ----------------------------------- |
| POST   | `/api/product-exports`                     | `202` JSON product export metadata  |
| GET    | `/api/product-exports`                     | `200` JSON list，包含 `pagination`  |
| GET    | `/api/product-exports/reference/templates` | `200` JSON template array           |
| GET    | `/api/product-exports/{id}`                | `200` JSON product export metadata  |
| GET    | `/api/product-exports/{id}/download`       | `200` stream/JSON 或 `302` redirect |
| DELETE | `/api/product-exports/{id}`                | `204` empty response                |

创建导出时 body 至少包含 `name` 与 `template`。当前内置 template 为 `basic`，字段列表由 server 的 product export template module 统一返回，前端只消费接口数据，不维护独立字段列表：

```json
[
  {
    "code": "basic",
    "label": "Basic",
    "fields": [
      "id",
      "title",
      "handle",
      "status",
      "vendor",
      "productType",
      "createdAt",
      "updatedAt"
    ]
  }
]
```

## 列表分页

`GET /api/product-exports` 支持 cursor 和 page 两种分页模式，但同一次请求不能同时传 `cursor` 与 `page`。`limit` 默认 `20`，最大值为 `100`；超过 `100` 会在 query validation 阶段返回 `400`。Page 模式只允许浅页导航，当前 `page` 最大为 `50`，有效 offset 上限为 `5000`；更深的翻页会返回 `400`，调用方应改用服务端返回的 `nextCursor`。`status` 可继续作为列表过滤条件。

Cursor 模式：

```text
GET /api/product-exports?limit=20&cursor=<nextCursor>
```

Page 模式适合浅页跳转：

```text
GET /api/product-exports?limit=20&page=2
```

状态过滤可以和任一分页模式组合：

```text
GET /api/product-exports?status=ready&limit=20&page=2
```

响应把资源集合统一放在 `data.result`，把分页信息放在 `data.pagination`。Cursor 是服务端生成的 opaque seek cursor，客户端只应原样传回，不应自行拼接：

```json
{
  "data": {
    "result": [],
    "pagination": {
      "mode": "page",
      "limit": 20,
      "page": 2,
      "total": 42,
      "hasNext": false
    }
  }
}
```

## 数据库

导出 job、part 和生成文件关联通过 Drizzle-backed product export repository 存储：

```text
apps/server/src/app/modules/product-export/repositories/database/index.ts
apps/server/src/app/modules/product-export/repositories/database/postgres.ts
apps/server/src/app/modules/product-export/repositories/database/sqlite.ts
apps/server/src/app/modules/product-export/repositories/database/shared.ts
packages/database/src/models/postgres/product-exports.ts
packages/database/src/models/sqlite/product-exports.ts
```

`index.ts` 按 Drizzle database kind 分发 PostgreSQL 或 SQLite/D1 store；`postgres.ts` 与 `sqlite.ts` 放置 dialect-specific 查询；`shared.ts` 放置分页转换、cursor 读取、page offset 和 part 统计聚合。列表查询会多取一条记录判断 `hasNext`；page 模式额外执行 `count` 返回 `total`，cursor 模式不计算总数以避免深翻页带来的额外扫描。Part 状态统计在数据库侧聚合，避免把大量 part 记录读入应用内存。

Finalize 和 ready 后的临时 part object 清理会通过 `listPartsPage` 按 `seq` 分页读取 part metadata，避免一次性把全部 part 行加载到应用内存。Cloudflare runtime 在 finalize 前使用 `getPartStats().total` 判断 part 数量；超过 `PRODUCT_EXPORT_CLOUDFLARE_FINALIZE_PART_THRESHOLD` 时会把导出标记为 `failed`，错误码为 `CLOUDFLARE_FINALIZE_UNSUPPORTED`。这是明确的 runtime 边界：Cloudflare Queue 任务不能在执行中切换到 Node，因此不会再写入 `requires_node_finalize` 等待不存在的本地 handoff。

## 下载

`GET /api/product-exports/{id}/download` 只对 `ready` 且已有 bucket object 的导出可用。浏览器默认可能收到 `302` 跳转到短期签名文件 URL；如果请求头包含 `Accept: application/json`，接口会返回 JSON download target，便于前端避免跨源 fetch redirect。
