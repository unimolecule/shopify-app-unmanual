import { postgresShopifySessions } from "@unimolecule/shopify-app-unmanual-database/models/postgres";
import type { ShopifySessionStorage } from "./types";
import type { PostgresDatabase } from "@/infra/database";

type ShopifySessionStorageConstructor = new (
  db: unknown,
  table: unknown,
) => ShopifySessionStorage;

export async function createPostgresShopifySessionStorage(
  database: PostgresDatabase,
): Promise<ShopifySessionStorage> {
  const { DrizzleSessionStoragePostgres } =
    (await import("@shopify/shopify-app-session-storage-drizzle/dist/esm/adapters/drizzle-postgres.adapter.mjs")) as {
      DrizzleSessionStoragePostgres: ShopifySessionStorageConstructor;
    };

  return new DrizzleSessionStoragePostgres(
    database.db,
    postgresShopifySessions,
  );
}
