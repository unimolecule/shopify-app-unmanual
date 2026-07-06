import { sqliteShopifySessions } from "@shamt/database/models/sqlite";
import type { ShopifySessionStorage } from "./types";
import type { D1DatabaseClient } from "@/infra/database";

type ShopifySessionStorageConstructor = new (
  db: unknown,
  table: unknown,
) => ShopifySessionStorage;

export async function createSqliteShopifySessionStorage(
  database: D1DatabaseClient,
): Promise<ShopifySessionStorage> {
  const { DrizzleSessionStorageSQLite } =
    (await import("@shopify/shopify-app-session-storage-drizzle/dist/esm/adapters/drizzle-sqlite.adapter.mjs")) as {
      DrizzleSessionStorageSQLite: ShopifySessionStorageConstructor;
    };

  return new DrizzleSessionStorageSQLite(database.db, sqliteShopifySessions);
}
