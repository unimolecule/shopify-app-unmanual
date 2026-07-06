declare module "@shopify/shopify-app-session-storage-drizzle/dist/esm/adapters/drizzle-postgres.adapter.mjs" {
  export class DrizzleSessionStoragePostgres {
    constructor(db: unknown, table: unknown);

    storeSession(
      session: import("@shopify/shopify-api").Session,
    ): Promise<boolean>;
    loadSession(
      id: string,
    ): Promise<import("@shopify/shopify-api").Session | undefined>;
    deleteSession(id: string): Promise<boolean>;
    deleteSessions(ids: string[]): Promise<boolean>;
    findSessionsByShop(
      shop: string,
    ): Promise<import("@shopify/shopify-api").Session[]>;
  }
}

declare module "@shopify/shopify-app-session-storage-drizzle/dist/esm/adapters/drizzle-sqlite.adapter.mjs" {
  export class DrizzleSessionStorageSQLite {
    constructor(db: unknown, table: unknown);

    storeSession(
      session: import("@shopify/shopify-api").Session,
    ): Promise<boolean>;
    loadSession(
      id: string,
    ): Promise<import("@shopify/shopify-api").Session | undefined>;
    deleteSession(id: string): Promise<boolean>;
    deleteSessions(ids: string[]): Promise<boolean>;
    findSessionsByShop(
      shop: string,
    ): Promise<import("@shopify/shopify-api").Session[]>;
  }
}
