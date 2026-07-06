import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerQueueJob,
  type QueueJobContext,
  type QueueMessage,
} from "@/infra/queue";
import { consumeQueueBatch } from "@/infra/queue/consumer";
import {
  CloudflareQueueProducer,
  createIsolateQueueConsumer,
} from "@/infra/queue/isolate";
import { resetQueueJobs } from "@/infra/queue/registry";
import { getQueueEnvConfig, getQueueJobName } from "@/infra/queue/shared";
import { throwAppServerError as throwError } from "../internal";

const context = {
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  runtimeEnv: {
    APP_RUNTIME: "node",
  },
} as unknown as QueueJobContext;

describe("queue batch consumer", () => {
  afterEach(() => {
    resetQueueJobs();
    vi.clearAllMocks();
  });

  it("routes single-message jobs and acknowledges successful messages", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerQueueJob({
      handler,
      name: "test:single",
    });

    const result = await consumeQueueBatch(
      {
        messages: [
          {
            attempts: 1,
            body: {
              name: "test:single",
              payload: { id: "one" },
              version: 1,
            },
            id: "message-one",
          },
        ],
      },
      context,
    );

    expect(handler).toHaveBeenCalledWith({ id: "one" }, context);
    expect(result.results).toEqual([
      {
        action: "ack",
        id: "message-one",
      },
    ]);
  });

  it("routes batch jobs with grouped messages", async () => {
    const batchHandler = vi.fn().mockResolvedValue(undefined);
    registerQueueJob({
      batchHandler,
      mode: "batch",
      name: "test:batch",
    });

    const result = await consumeQueueBatch(
      {
        messages: [
          {
            attempts: 1,
            body: {
              name: "test:batch",
              payload: { id: "one" },
              version: 1,
            },
            id: "message-one",
          },
          {
            attempts: 1,
            body: {
              name: "test:batch",
              payload: { id: "two" },
              version: 1,
            },
            id: "message-two",
          },
        ],
      },
      context,
    );

    expect(batchHandler).toHaveBeenCalledWith(
      [
        {
          name: "test:batch",
          payload: { id: "one" },
          version: 1,
        },
        {
          name: "test:batch",
          payload: { id: "two" },
          version: 1,
        },
      ],
      context,
    );
    expect(result.results).toEqual([
      {
        action: "ack",
        id: "message-one",
      },
      {
        action: "ack",
        id: "message-two",
      },
    ]);
  });

  it("retries messages without registered jobs", async () => {
    const result = await consumeQueueBatch(
      {
        messages: [
          {
            attempts: 1,
            body: {
              name: "test:missing",
              payload: {},
              version: 1,
            },
            id: "message-one",
          },
        ],
      },
      context,
    );

    expect(result.results[0]?.action).toBe("retry");
    expect(result.results[0]?.id).toBe("message-one");
  });

  it("retries only the failed single-message job", async () => {
    registerQueueJob({
      // eslint-disable-next-line require-await
      handler: async (payload) => {
        if (payload.id === "bad") {
          throwError("bad payload");
        }
      },
      name: "test:single",
    });

    const result = await consumeQueueBatch(
      {
        messages: [
          {
            attempts: 1,
            body: {
              name: "test:single",
              payload: { id: "good" },
              version: 1,
            },
            id: "message-good",
          },
          {
            attempts: 1,
            body: {
              name: "test:single",
              payload: { id: "bad" },
              version: 1,
            },
            id: "message-bad",
          },
        ],
      },
      context,
    );

    expect(result.results.map((item) => item.action)).toEqual(["ack", "retry"]);
    expect(result.results.map((item) => item.id)).toEqual([
      "message-good",
      "message-bad",
    ]);
  });

  it("retries the whole grouped batch when a batch handler fails", async () => {
    registerQueueJob({
      // eslint-disable-next-line require-await
      batchHandler: async () => {
        throwError("batch failed");
      },
      mode: "batch",
      name: "test:batch",
    });

    const result = await consumeQueueBatch(
      {
        messages: [
          {
            attempts: 1,
            body: {
              name: "test:batch",
              payload: { id: "one" },
              version: 1,
            },
            id: "message-one",
          },
          {
            attempts: 1,
            body: {
              name: "test:batch",
              payload: { id: "two" },
              version: 1,
            },
            id: "message-two",
          },
        ],
      },
      context,
    );

    expect(result.results).toEqual([
      expect.objectContaining({
        action: "retry",
        id: "message-one",
      }),
      expect.objectContaining({
        action: "retry",
        id: "message-two",
      }),
    ]);
  });

  it("creates a cloudflare queue consumer that consumes queue batches", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const ack = vi.fn();
    const retry = vi.fn();
    registerQueueJob({
      handler,
      name: "test:single",
    });

    const consumer = await createIsolateQueueConsumer({
      APP_RUNTIME: "cloudflare",
    } as any);
    await consumer.consume(
      {
        messages: [
          {
            ack,
            attempts: 1,
            body: {
              name: "test:single",
              payload: { id: "one" },
              version: 1,
            },
            id: "message-one",
            retry,
          },
        ],
      } as any,
      context,
    );

    expect(handler).toHaveBeenCalledWith({ id: "one" }, context);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
});

describe("queue runtime strategy", () => {
  it("defaults node to pg-boss and prefixes job names with pg-boss safe characters", () => {
    const strategy = getQueueEnvConfig({
      APP_DATABASE_PROVIDER: "postgres",
      APP_QUEUE_NAME: "shopify-app",
      APP_RUNTIME: "node",
    } as any);

    expect(strategy).toEqual({
      name: "shopify-app",
      provider: "pg-boss",
      runtime: "node",
    });
    expect(getQueueJobName(strategy, "product-export.start-bulk")).toBe(
      "shopify-app/product-export.start-bulk",
    );
  });

  it("rejects unsupported runtime/provider pairs", () => {
    expect(() =>
      getQueueEnvConfig({
        APP_DATABASE_PROVIDER: "postgres",
        APP_QUEUE_PROVIDER: "queues",
        APP_RUNTIME: "node",
      } as any),
    ).toThrow(/Node runtime only supports/);

    expect(() =>
      getQueueEnvConfig({
        APP_QUEUE_PROVIDER: "pg-boss",
        APP_RUNTIME: "cloudflare",
      } as any),
    ).toThrow(/Cloudflare runtime only supports/);
  });

  it("requires postgres for node pg-boss", () => {
    expect(() =>
      getQueueEnvConfig({
        APP_DATABASE_PROVIDER: "d1",
        APP_QUEUE_PROVIDER: "pg-boss",
        APP_RUNTIME: "node",
      } as any),
    ).toThrow(/requires the postgres database provider/);
  });
});

describe("cloudflare queue producer", () => {
  it("sends one JSON message with queue options", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const producer = new CloudflareQueueProducer({
      send,
      sendBatch: vi.fn(),
    } as any);
    const message: QueueMessage = {
      name: "test:job",
      payload: { id: "one" },
      version: 1,
    };

    await producer.enqueue(message, {
      delaySeconds: 5,
      maxAttempts: 9,
    });

    expect(send).toHaveBeenCalledWith(message, {
      contentType: "json",
      delaySeconds: 5,
    });
  });

  it("sends batches with shared queue options", async () => {
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const producer = new CloudflareQueueProducer({
      send: vi.fn(),
      sendBatch,
    } as any);

    await producer.enqueueBatch(
      [
        {
          name: "test:one",
          payload: {},
          version: 1,
        },
        {
          name: "test:two",
          payload: {},
          version: 1,
        },
      ],
      {
        delaySeconds: 10,
      },
    );

    expect(sendBatch).toHaveBeenCalledWith([
      {
        body: {
          name: "test:one",
          payload: {},
          version: 1,
        },
        contentType: "json",
        delaySeconds: 10,
      },
      {
        body: {
          name: "test:two",
          payload: {},
          version: 1,
        },
        contentType: "json",
        delaySeconds: 10,
      },
    ]);
  });
});

describe("process queue consumer", () => {
  afterEach(() => {
    vi.doUnmock("pg-boss");
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates registered pg-boss queues before polling them", async () => {
    const calls: string[] = [];
    const boss = {
      complete: vi.fn(),
      createQueue: vi.fn((name: string) => {
        calls.push(`createQueue:${name}`);
        return Promise.resolve();
      }),
      fail: vi.fn(),
      fetch: vi.fn((name: string) => {
        calls.push(`fetch:${name}`);
        return Promise.resolve([]);
      }),
      start: vi.fn(),
      stop: vi.fn(),
    };

    vi.doMock("pg-boss", () => ({
      PgBoss: vi.fn(function PgBoss() {
        return boss;
      }),
    }));

    const { registerQueueJob, resetQueueJobs } =
      await import("@/infra/queue/registry");
    const { createProcessQueueConsumer } =
      await import("@/infra/queue/process");

    resetQueueJobs();
    registerQueueJob({
      handler: vi.fn(),
      name: "test.one",
    });
    registerQueueJob({
      handler: vi.fn(),
      name: "test.two",
    });

    const consumer = await createProcessQueueConsumer({
      APP_DATABASE_PROVIDER: "postgres",
      APP_DATABASE_URL: "postgres://example.test/app",
      APP_QUEUE_NAME: "default",
      APP_RUNTIME: "node",
    } as any);

    await consumer.start(context);
    await consumer.stop();

    expect(boss.createQueue).toHaveBeenCalledWith("default/test.one");
    expect(boss.createQueue).toHaveBeenCalledWith("default/test.two");
    expect(calls.indexOf("createQueue:default/test.one")).toBeLessThan(
      calls.indexOf("fetch:default/test.one"),
    );
    expect(calls.indexOf("createQueue:default/test.two")).toBeLessThan(
      calls.indexOf("fetch:default/test.two"),
    );
  });
});
