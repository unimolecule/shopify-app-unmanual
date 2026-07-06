# Bucket

`apps/server/src/infra/bucket` 是 file、product-export 等模块使用的 runtime-aware object bucket 层。它暴露一个很小的 `Bucket` 接口、provider strategy parser 和 R2 signed URL helper。具体 Node/Cloudflare adapter 由 runtime capability 注册处显式选择。

## 接口

```ts
export interface Bucket {
  put: (input: BucketPutInput) => Promise<BucketStoredObject>;
  open: (input: BucketOpenInput) => Promise<BucketReadableObject>;
  delete: (input: BucketDeleteInput) => Promise<void>;
}

export interface BucketDownloadSigner {
  signDownloadUrl: (input: BucketDownloadSignInput) => Promise<string>;
}
```

`put` 接收 `ReadableStream<Uint8Array>`，在 streaming 写入时统计字节数，并在超过 `APP_FILE_MAX_SIZE` 时返回 payload-too-large。

## Providers

Provider 值来自 `APP_BUCKET_PROVIDER`：

| Provider | 值       | Runtime 支持               |
| -------- | -------- | -------------------------- |
| Memory   | `memory` | 仅 Node                    |
| R2       | `r2`     | Node 和 Cloudflare runtime |

Runtime-aware 默认值：

| Runtime      | 默认 provider |
| ------------ | ------------- |
| `node`       | `memory`      |
| `cloudflare` | `r2`          |

Cloudflare 只接受 `r2` provider。Node 接受 `memory` 和 `r2`。

## Process Memory Bucket

`ProcessMemoryBucket` 把文件存储在：

```text
{process.cwd()}/public/{APP_FILE_DIR}/{bucketKey}
```

在 server app 中会解析为：

```text
apps/server/public/files/{shopDomain}/{yyyy}/{mm}/{fileOrBatchId}/{safeName}
```

bucket 在触碰磁盘前会把每个 key 规范化并解析到配置的 root 目录下。任何试图逃逸 root 的 key 都会被拒绝。

上传使用 `node:stream/promises.pipeline`、`Readable.fromWeb` 和 `createWriteStream(..., { flags: "wx" })`。写入失败或超出大小限制时，会删除已经部分写入的文件。

## R2 Bucket

`r2` provider 会根据 runtime 选择不同 adapter：

| Runtime      | Adapter           | 说明                                        |
| ------------ | ----------------- | ------------------------------------------- |
| `node`       | S3-compatible API | 使用 `@aws-sdk/client-s3` 访问 R2           |
| `cloudflare` | Worker R2 binding | 使用 `APP_BUCKET_R2_BINDING` 指向的 binding |

Node 下的 `S3CompatibleBucket` 使用 `@aws-sdk/client-s3`，配置为：

```text
region: auto
forcePathStyle: true
```

对应实现文件：

```text
apps/server/src/infra/bucket/process.s3-compatible.ts
apps/server/src/infra/bucket/process.ts
apps/server/src/infra/bucket/isolate.ts
```

R2 adapter 使用 multipart upload 写入对象。`BucketPutInput.maxBytes` 控制对象最大字节数，`maxParts` 可选控制 multipart metadata 数组最大长度；超过任一上限都会 abort 当前 multipart upload 并返回 payload-too-large。这个边界用于防止最终 `complete` 需要保存的 parts metadata 在大文件场景下无界增长。product export 当前传入 `PRODUCT_EXPORT_MAX_MULTIPART_UPLOAD_PARTS = 10000`。

`infra/bucket/index.ts` 只导出共享契约和 `createBucketDownloadSigner(...)`。Node runtime capability 从 `infra/bucket/process.ts` 引入 `getProcessBucket(...)`；Cloudflare runtime capability 从 `infra/bucket/isolate.ts` 引入 `createIsolateBucket(...)`。process bucket 可以缓存 adapter；isolate bucket 当前是 request-bound，disposer 是 no-op。

Node + R2 必需 env：

| Env                         | 说明                              |
| --------------------------- | --------------------------------- |
| `APP_BUCKET_R2_URL`         | 带 bucket path 的 S3 endpoint URL |
| `APP_CLOUDFLARE_USER_TOKEN` | 个人 token                        |

使用 `APP_CLOUDFLARE_USER_TOKEN` + Cloudflare token verify API 的方式获取
access id，并用 token hash 作为 secret access key。verify 请求通过
`getCloudflareTokenId(config, token)` 发起，内部使用 `getClientProvider(config)`；
`@unimolecule/oh-my-fetch` 在传入绝对 URL 时会绕过 client prefix/base URL，因此不会被
`APP_API_PREFIX` 影响。详情参考：

<https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token>

`APP_BUCKET_R2_URL` 必须在 path 中包含 bucket name：

```text
https://<account-id>.r2.cloudflarestorage.com/<bucket-name>
```

解析后会得到：

```text
endpoint: https://<account-id>.r2.cloudflarestorage.com
bucketName: <bucket-name>
```

Cloudflare + R2 不读取这些 S3 credential，而是在 runtime capability 使用点强校验 `APP_BUCKET_R2_BINDING` 指向的 Worker binding。这样 Worker 内部上传、读取和删除都通过平台内置 binding 完成，不经过 Cloudflare REST API 或 S3 HTTP endpoint。非 production R2 binding 会生成 `remote: true`，让本地 `wrangler dev` 写入远端 development R2；否则本地 R2 模拟里的对象不会出现在 signed URL 指向的远端 R2 bucket 中。

## R2 下载

R2 download 使用共享的 `R2SignedUrlDownloadSigner` 生成短期 SigV4 signed URL。Node + R2 与 Cloudflare + R2 共用同一套 Web Crypto 签名逻辑；Node 的上传、读取和删除仍通过 `@aws-sdk/client-s3` 访问 S3-compatible API，Cloudflare 的上传、读取和删除仍通过 R2 binding 访问平台内置能力。签名 URL 默认由 file module 使用 `300000ms` TTL，并带上：

```text
response-content-type: <file.contentType>
response-content-disposition: attachment; filename*=UTF-8''<encoded originalName>
```

没有 signed URL signer 的 provider 会 fallback 到私有 stream response。响应仍由 file module 设置：

```text
Content-Type: <file.contentType>
Content-Length: <object.byteSize>
Content-Disposition: attachment; filename*=UTF-8''<encoded originalName>
Cache-Control: private, no-store
```

## Runtime Upload Body Adapters

bucket 会接收一个 runtime-specific upload body adapter：

| Runtime | Adapter 行为                                                                  |
| ------- | ----------------------------------------------------------------------------- |
| Node    | 将 Web stream 转成 Node `Readable`，并通过 byte-counting `Transform` 管道传递 |
| Isolate | 通过 Web `TransformStream` 管道传递，并在 R2 binding upload 前统计字节数      |

两个 adapter 都会暴露 `getByteLength()`，让 `put` 可以在上传完成后返回实际存储字节数。

## 当前边界

- Node + R2 与 Cloudflare + R2 当前都返回 S3-compatible endpoint 的短期签名 URL。
- R2 custom domain signed download 尚未实现；当前签名 URL 使用 `APP_BUCKET_R2_URL` 解析出的 endpoint 与 bucket path。
- bucket adapter 生命周期由 runtime capability disposer 管理；业务对象生命周期清理不在这里实现，pg-boss 或 Cloudflare Queue consumer 应调用 `bucket.delete(...)`。

## 测试

常用聚焦检查：

```bash
pnpm --dir apps/server exec vitest run \
  tests/bucket-strategy.test.ts \
  tests/process-memory-bucket.test.ts \
  tests/isolate-s3-compatible-bucket.test.ts
```
