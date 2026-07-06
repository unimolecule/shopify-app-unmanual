import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const extendMock = vi.hoisted(() =>
  vi.fn(() => ({
    delete: deleteMock,
    get: getMock,
    post: postMock,
  })),
);
const createHttpClientMock = vi.hoisted(() =>
  vi.fn(() => ({
    extend: extendMock,
  })),
);
const isEmbeddedShopifyAppMock = vi.hoisted(() => vi.fn(() => false));
const isStandaloneShopifyAppModeMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("@unimolecule/oh-my-fetch/client", () => {
  return {
    createHttpClient: createHttpClientMock,
  };
});

vi.mock("@unimolecule/oh-my-fetch/errors", () => {
  class HttpRequestError extends Error {
    status?: number;

    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.name = "HttpRequestError";
      this.status = options.status;
    }
  }

  return {
    HttpRequestError,
  };
});

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("@/utils/public-env", () => ({
  DEFAULT_APP_API_PREFIX: "api",
  DEFAULT_REQUEST_TIMEOUT: 180_000,
  isEmbeddedShopifyApp: isEmbeddedShopifyAppMock,
  isStandaloneShopifyAppMode: isStandaloneShopifyAppModeMock,
}));

interface ShopifyClientPlugin {
  beforeError: (error: Error) => Error;
  name: string;
}

interface ShopifyClientOptions {
  plugins: ShopifyClientPlugin[];
}

interface ShopifyClientHooks {
  afterResponse: <T>(response: T) => T;
  beforeError: (error: Error) => Error;
  beforeRequest: (config: {
    credentials?: RequestCredentials;
    headers?: HeadersInit | Record<string, string | undefined>;
    signal?: AbortSignal;
  }) => Promise<{
    credentials: RequestCredentials;
    headers: Headers;
    signal?: AbortSignal;
  }>;
}

interface ShopifyClientExtendOptions {
  hooks: ShopifyClientHooks;
}

describe("shopify client", () => {
  beforeEach(() => {
    vi.resetModules();
    createHttpClientMock.mockClear();
    extendMock.mockClear();
    toastMock.mockReset();
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    isEmbeddedShopifyAppMock.mockReturnValue(false);
    isStandaloneShopifyAppModeMock.mockReturnValue(true);
    vi.spyOn(globalThis, "open").mockImplementation(() => null);
    globalThis.history.pushState({}, "", "/?shop=shop.myshopify.com");
    Reflect.deleteProperty(globalThis, "shopify");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a prefixed Shopify API client with lifecycle hooks", async () => {
    const { DEFAULT_APP_API_PREFIX, DEFAULT_REQUEST_TIMEOUT } =
      await import("../src/utils/public-env");

    await import("../src/utils/client.shopify");

    expect(createHttpClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `/${DEFAULT_APP_API_PREFIX}`,
        timeout: DEFAULT_REQUEST_TIMEOUT,
        retry: { limit: 0 },
        plugins: [
          expect.objectContaining({
            name: "http-error-toast",
            beforeError: expect.any(Function),
          }),
        ],
      }),
    );
    expect(extendMock).toHaveBeenCalledWith({
      hooks: expect.objectContaining({
        afterResponse: expect.any(Function),
        beforeError: expect.any(Function),
        beforeRequest: expect.any(Function),
      }),
    });
  });

  it("shows status-specific toast messages from the base client plugin", async () => {
    const [{ HttpRequestError }] = await Promise.all([
      import("@unimolecule/oh-my-fetch/errors"),
      import("../src/utils/client.shopify"),
    ]);
    const options = readCreateHttpClientOptions();
    const plugin = options.plugins[0];
    if (!plugin) throw new Error("Expected a Shopify client plugin.");
    const error = new HttpRequestError("missing", { status: 404 });

    expect(plugin.beforeError(error)).toBe(error);
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "The requested resource could not be found.",
      );
    });
  });

  it("adds standalone credentials without an embedded session token", async () => {
    await import("../src/utils/client.shopify");
    const hooks = readShopifyClientHooks();
    const signal = new AbortController().signal;

    const config = await hooks.beforeRequest({
      headers: { accept: "application/json", authorization: undefined },
      signal,
    });

    expect(config.credentials).toBe("include");
    expect(config.signal).toBe(signal);
    expect(config.headers.get("accept")).toBe("application/json");
    expect(config.headers.has("authorization")).toBe(false);
  });

  it("adds App Bridge authorization headers for embedded requests", async () => {
    isEmbeddedShopifyAppMock.mockReturnValue(true);
    isStandaloneShopifyAppModeMock.mockReturnValue(false);
    const idToken = vi.fn().mockResolvedValue("session-token");
    Object.assign(globalThis, {
      shopify: {
        idToken,
      },
    });

    await import("../src/utils/client.shopify");
    const hooks = readShopifyClientHooks();

    const config = await hooks.beforeRequest({
      headers: new Headers({ accept: "application/json" }),
    });

    expect(config.credentials).toBe("same-origin");
    expect(config.headers.get("authorization")).toBe("Bearer session-token");
    expect(config.headers.get("accept")).toBe("application/json");
    expect(idToken).toHaveBeenCalledOnce();
  });

  it("maps 401 errors to Shopify auth redirects and throttles repeat redirects", async () => {
    const [{ HttpRequestError }, { ShopifyAuthRedirectError }] =
      await Promise.all([
        import("@unimolecule/oh-my-fetch/errors"),
        import("../src/utils/client.shopify"),
      ]);
    const hooks = readShopifyClientHooks();
    const error = new HttpRequestError("unauthorized", { status: 401 });

    const first = hooks.beforeError(error);
    const second = hooks.beforeError(error);

    expect(first).toBeInstanceOf(ShopifyAuthRedirectError);
    expect(second).toBeInstanceOf(ShopifyAuthRedirectError);
    expect(globalThis.open).toHaveBeenCalledOnce();

    hooks.afterResponse(new Response());
    const third = hooks.beforeError(error);

    expect(third).toBeInstanceOf(ShopifyAuthRedirectError);
    expect(globalThis.open).toHaveBeenCalledTimes(2);
  });

  it("keeps non-401 errors unchanged", async () => {
    const [{ HttpRequestError }] = await Promise.all([
      import("@unimolecule/oh-my-fetch/errors"),
      import("../src/utils/client.shopify"),
    ]);
    const hooks = readShopifyClientHooks();
    const error = new HttpRequestError("missing", { status: 404 });

    expect(hooks.beforeError(error)).toBe(error);
    expect(globalThis.open).not.toHaveBeenCalled();
  });
});

describe("shopify api", () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it("fetches shop info through the Shopify client", async () => {
    const { fetchShopInfo } = await import("../src/apis/shopify");
    const signal = new AbortController().signal;
    getMock.mockResolvedValueOnce({
      data: { shop: { name: "Shop", myshopifyDomain: "shop.myshopify.com" } },
    });

    await expect(fetchShopInfo(signal)).resolves.toEqual({
      data: { shop: { name: "Shop", myshopifyDomain: "shop.myshopify.com" } },
    });
    expect(getMock).toHaveBeenCalledWith("shop", { signal });
  });

  it("fetches products through the Shopify client", async () => {
    const { fetchProducts } = await import("../src/apis/shopify");
    const signal = new AbortController().signal;
    getMock.mockResolvedValueOnce({
      data: {
        products: {
          edges: [{ node: { id: "gid://shopify/Product/1", title: "Tee" } }],
        },
      },
    });

    await expect(fetchProducts(signal)).resolves.toEqual({
      data: {
        products: {
          edges: [{ node: { id: "gid://shopify/Product/1", title: "Tee" } }],
        },
      },
    });
    expect(getMock).toHaveBeenCalledWith("product", { signal });
  });
});

describe("product export api", () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it("lists product exports through the Shopify client", async () => {
    const { listProductExports } = await import("../src/apis/product-exports");
    const signal = new AbortController().signal;
    getMock.mockResolvedValueOnce({
      data: {
        pagination: {
          hasNext: true,
          limit: 20,
          mode: "cursor",
          nextCursor: "next",
        },
        result: [],
      },
    });

    await expect(
      listProductExports(
        { cursor: "cursor", limit: 20, status: "ready" },
        signal,
      ),
    ).resolves.toEqual({
      data: {
        pagination: {
          hasNext: true,
          limit: 20,
          mode: "cursor",
          nextCursor: "next",
        },
        result: [],
      },
    });
    expect(getMock).toHaveBeenCalledWith("product-exports", {
      query: { cursor: "cursor", limit: 20, status: "ready" },
      signal,
    });
  });

  it("creates product exports through the Shopify client", async () => {
    const { createProductExport } = await import("../src/apis/product-exports");
    const signal = new AbortController().signal;
    const response = { data: { id: "export-1", name: "All products" } };
    postMock.mockResolvedValueOnce(response);

    await expect(
      createProductExport({ name: "All products" }, signal),
    ).resolves.toBe(response);
    expect(postMock).toHaveBeenCalledWith(
      "product-exports",
      { name: "All products" },
      { signal },
    );
  });

  it("gets, deletes, resolves, and downloads one product export", async () => {
    const {
      deleteProductExport,
      downloadProductExport,
      getProductExport,
      resolveProductExportDownload,
    } = await import("../src/apis/product-exports");
    const signal = new AbortController().signal;
    const response = new Response("csv");
    getMock.mockResolvedValueOnce({ data: { id: "export-1" } });
    deleteMock.mockResolvedValueOnce(undefined);
    getMock.mockResolvedValueOnce({
      data: { type: "redirect", url: "https://signed.example.com/file.csv" },
    });
    getMock.mockResolvedValueOnce(response);

    await expect(getProductExport("export-1", signal)).resolves.toEqual({
      data: { id: "export-1" },
    });
    await expect(deleteProductExport("export-1", signal)).resolves.toBe(
      undefined,
    );
    await expect(
      resolveProductExportDownload("export-1", signal),
    ).resolves.toEqual({
      data: { type: "redirect", url: "https://signed.example.com/file.csv" },
    });
    await expect(downloadProductExport("export-1", signal)).resolves.toBe(
      response,
    );

    expect(getMock).toHaveBeenNthCalledWith(1, "product-exports/export-1", {
      signal,
    });
    expect(deleteMock).toHaveBeenCalledWith("product-exports/export-1", {
      signal,
    });
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      "product-exports/export-1/download",
      {
        headers: {
          Accept: "application/json",
        },
        signal,
      },
    );
    expect(getMock).toHaveBeenNthCalledWith(
      3,
      "product-exports/export-1/download",
      {
        responseType: "response",
        signal,
      },
    );
  });

  it("starts redirect product export downloads without fetching the R2 URL as a blob", async () => {
    const click = vi.fn();
    const anchor = document.createElement("a");
    vi.spyOn(anchor, "click").mockImplementation(click);
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    getMock.mockResolvedValueOnce({
      data: { type: "redirect", url: "https://signed.example.com/file.csv" },
    });

    const { downloadProductExportFile } =
      await import("../src/apis/product-exports");

    await downloadProductExportFile({
      id: "export-1",
      name: "All products",
    } as never);

    expect(getMock).toHaveBeenCalledOnce();
    expect(anchor.href).toBe("https://signed.example.com/file.csv");
    expect(anchor.download).toBe("All products.csv");
    expect(click).toHaveBeenCalledOnce();
  });
});

function readShopifyClientHooks() {
  const calls = extendMock.mock.calls as unknown as [
    ShopifyClientExtendOptions,
  ][];
  const options = calls.at(-1)?.[0];
  if (!options) throw new Error("Expected Shopify client hooks.");
  return options.hooks;
}

function readCreateHttpClientOptions() {
  const calls = createHttpClientMock.mock.calls as unknown as [
    ShopifyClientOptions,
  ][];
  const options = calls.at(-1)?.[0];
  if (!options) throw new Error("Expected Shopify client options.");
  return options;
}
