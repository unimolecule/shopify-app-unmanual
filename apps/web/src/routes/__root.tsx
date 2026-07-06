import { createRootRouteWithContext } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { NotFound } from "@/components/errors";
import { RouteError } from "@/components/errors/route-error";
import { Loading } from "@/components/loading";
import { EmbeddedLayout } from "@/layouts/embedded";
import { StandaloneLayout } from "@/layouts/standalone";
import {
  DEFAULT_SHOPIFY_APP_MODES,
  getShopifyAppMode,
} from "@/utils/public-env";
import type { QueryClient } from "@tanstack/react-query";

const Devtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ ReactQueryDevtools }, { TanStackRouterDevtools }] =
        await Promise.all([
          import("@tanstack/react-query-devtools"),
          import("@tanstack/react-router-devtools"),
        ]);

      return {
        default: () => (
          <>
            <ReactQueryDevtools buttonPosition="bottom-left" />
            <TanStackRouterDevtools position="bottom-right" />
          </>
        ),
      };
    })
  : undefined;

const Toaster = lazy(async () => {
  const { Toaster } = await import("@/components/ui/sonner");

  return { default: Toaster };
});

function RootComponent() {
  const Layout =
    getShopifyAppMode() === DEFAULT_SHOPIFY_APP_MODES.STANDALONE
      ? StandaloneLayout
      : EmbeddedLayout;

  return (
    <>
      <Layout />
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
      {Devtools ? (
        <Suspense
          fallback={
            <Loading
              heading="Loading developer tools"
              message="Please wait while developer tools load."
              scope="page"
            />
          }
        >
          <Devtools />
        </Suspense>
      ) : null}
    </>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: () => <NotFound scope="page" />,
});
