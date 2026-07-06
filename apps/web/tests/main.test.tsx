import { cleanup, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRouterMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({
    children,
  }: {
    client: unknown;
    children: React.ReactNode;
  }) => <div data-testid="query-client-provider">{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  createRouter: createRouterMock,
  RouterProvider: ({ router }: { router: unknown }) => (
    <div
      data-router-ready={String(Boolean(router))}
      data-testid="router-provider"
    />
  ),
}));

vi.mock("../src/routeTree.gen", () => ({
  routeTree: { id: "route-tree" },
}));

describe("main entry", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouterMock.mockReset();
    createRouterMock.mockReturnValue({ id: "router" });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts the app into an empty root element", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");

    expect(createRouterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routeTree: { id: "route-tree" },
        scrollRestoration: true,
        defaultPreload: "intent",
      }),
    );
    expect(await screen.findByTestId("query-client-provider")).toBeTruthy();
    expect(await screen.findByTestId("router-provider")).toBeTruthy();
    expect(screen.getByTestId("router-provider").dataset.routerReady).toBe(
      "true",
    );
  });

  it("does not remount when the root already has content", async () => {
    document.body.innerHTML = '<div id="app"><p>hydrated</p></div>';

    await import("../src/main");

    expect(createRouterMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("hydrated")).toBeTruthy();
    expect(screen.queryByTestId("router-provider")).toBeNull();
  });
});
