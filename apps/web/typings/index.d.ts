/// <reference types="@shopify/polaris-types" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="@shopify/app-bridge-types" />

/* eslint-disable vars-on-top */
import type {
  SAppNavAttributes,
  SAppNavLinkAttributes,
} from "@shopify/app-bridge-types";
import type { ConfigSchema } from "@unimolecule/shopify-app-unmanual-app-env";

type PublicEnv = Omit<
  ConfigSchema,
  "SHOPIFY_APP_SECRET" | "APP_CACHE_REDIS_URL" | "APP_DATABASE_URL"
>;

declare global {
  var __PUBLIC_ENV__: PublicEnv | undefined;

  interface Window {
    __PUBLIC_ENV__?: PublicEnv;
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": SAppNavAttributes;
      // @ts-expect-error Merge App Bridge app-nav link attributes into Polaris' s-link type.
      "s-link": IntrinsicElements["s-link"] &
        Pick<SAppNavLinkAttributes, "rel">;
    }
  }
}

export {};
