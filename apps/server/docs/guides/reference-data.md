# Reference Data 决策

本文记录 `product-export/reference/templates` 与通用 `reference` module 的边界决策。它是架构 guide，不是接口 reference。

## 决策

使用 `reference` 作为标准数据与运营可管理数据的统一业务概念，不使用 `dictionary` 作为模块名。

原因是 `dictionary` 更像“键值字典”实现细节，容易把所有静态常量、配置和运营数据都塞进同一个桶里。`reference data` 更贴近业务语义：它描述可被其他模块引用的标准选项、枚举、分类、模板元数据或运营维护的基础数据。

当前采用两层边界：

| 边界                 | 负责内容                                                | 示例                          |
| -------------------- | ------------------------------------------------------- | ----------------------------- |
| 业务模块内 reference | 只服务该业务模块的只读参考数据或模板说明                | product export file templates |
| 通用 `reference`     | 跨模块复用、需要持久化、需要运营 CRUD 的 reference data | gender、后续地址基础数据      |

## Product Export Templates

`product-export/reference/templates` 用于 product export 模块内的模板查询。

这里的 `product-export/reference/templates` 表达的是路径语义：在 product export 模块下暴露“导出模板参考数据”。如果当前 HTTP module 仍挂在 `/{APP_API_PREFIX}/product-exports`，实际实现时应保持现有 resource 命名一致，例如：

```text
GET /api/product-exports/reference/templates
```

这个接口只返回 product export 模块需要的模板定义，例如：

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

前端不维护模板字段列表。前端只消费 server 返回的模板 code、label 和 fields，用于下拉菜单和 aside 字段预览。

Product export template 初期不放入通用 `references` 表。原因是导出模板不是简单的 code/label 选项，它带有字段列表、导出查询语义和后续可能的格式配置；它属于 product export module 的业务规则。

当模板需要运营后台编辑时，再把 product export template 升级为专门的数据模型，或由 product export module 读取通用 reference module 中的模板索引，同时把复杂字段列表保留在 product export 自己的模板模型中。

## Reference Module

通用 `reference` module 用于可持久化、可运营管理、可跨模块复用的 reference data。

当前占位示例是：

```text
GET    /api/reference/gender
POST   /api/reference/gender
GET    /api/reference/gender/{id}
PATCH  /api/reference/gender/{id}
DELETE /api/reference/gender/{id}
```

`gender` 默认包含 `male` 和 `female`，后续运营可以新增 `unknown`。默认值由 server 负责初始化或确保存在，前端不硬编码这些值。

Reference list 接口必须使用分页边界，避免运营数据增长后出现无界读取。当前约定：

- `GET /api/reference/{namespace}` 支持 `limit`、`cursor`、`page` 和 `enabled`。
- 默认 `limit` 为 `50`，最大值遵循共享 `PaginationQuerySchema`。
- cursor 按 `sortOrder`、`code`、`id` 升序生成，保证同一排序号下仍可稳定翻页。
- page 模式仅用于浅层导航；深层遍历应使用 cursor。

Reference 的核心字段保持通用：

| 字段        | 含义                                   |
| ----------- | -------------------------------------- |
| `namespace` | reference data 命名空间，例如 `gender` |
| `code`      | 稳定机器值，例如 `male`                |
| `label`     | 人类可读文案，例如 `Male`              |
| `sortOrder` | 展示排序                               |
| `enabled`   | 是否可被选择                           |
| `system`    | 是否为系统默认项                       |

通用 `reference` module 通过 `runtimeCapabilities.database.repositories.references()` 获取数据库-backed repository，并提供 PostgreSQL 与 D1/SQLite 两套实现。`repositories/database/index.ts` 只保留类型出口；Node runtime 绑定 `postgres.ts`，Cloudflare runtime 绑定 `sqlite.ts`。业务 controller/service 不直接判断 Node、Cloudflare、PostgreSQL 或 D1。

## 放入哪个边界

优先使用以下规则判断数据归属。

只属于一个业务模块、并且带有业务行为的数据，留在对应业务模块内：

| 数据                         | 所属边界              |
| ---------------------------- | --------------------- |
| product export template      | product-export module |
| product export template 字段 | product-export module |
| product export CSV 查询语义  | product-export module |

可被多个模块引用，或者运营需要统一维护的基础选项，放入通用 `reference` module：

| 数据                    | 所属边界             |
| ----------------------- | -------------------- |
| gender                  | reference module     |
| 国家/省市区等地址基础项 | reference 或专门模块 |
| 运营维护的标准分类      | reference module     |

地址数据如果只是少量可选项，可以进入 `reference` module。若它变成层级结构、行政区划版本、批量导入、搜索、经纬度或多语言数据，应单独建 `address` 或 `location` module，再把 `reference` module 作为轻量选项层，而不是把复杂地址域模型塞进 `references`。

## 演进原则

- 前端只消费 server 暴露的 reference 数据，不维护业务模板字段列表或标准选项。
- `reference` module 只放通用、稳定、可运营管理的 reference data。
- 业务模块可以暴露自己的 `reference/*` 子路径，用于该模块专属参考数据。
- 当模块专属参考数据开始跨模块复用，再迁入通用 `reference` module 或抽取更明确的领域模块。
- 不为了“统一”提前把所有静态常量都入库；只有需要运营管理、跨 runtime 一致、跨模块复用或动态发布时才持久化。
