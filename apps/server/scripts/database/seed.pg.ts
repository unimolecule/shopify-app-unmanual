import { DEFAULT_APP_BUCKET_PROVIDERS } from "@shamt/app-env";
import {
  postgresFiles,
  postgresShopifySessions,
} from "@shamt/database/models/postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requirePostgresSeedUrl } from "./env";

const SEED_SHOP_DOMAIN = "seed-shop.myshopify.com";
const SEED_FILE_ID = "seed-file-00000000-0000-4000-8000-000000000001";
const SEED_SESSION_ID = `offline_${SEED_SHOP_DOMAIN}`;

/**
 * Seeds one Shopify offline session and one file metadata row into PostgreSQL.
 */
async function main() {
  const databaseUrl = requirePostgresSeedUrl();
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({
    client: pool,
    schema: {
      postgresFiles,
      shopifySessions: postgresShopifySessions,
    },
  });

  try {
    const now = new Date();
    const [session] = await db
      .insert(postgresShopifySessions)
      .values({
        accessToken: "",
        id: SEED_SESSION_ID,
        isOnline: false,
        shop: SEED_SHOP_DOMAIN,
        state: "seed-state",
      })
      .onConflictDoUpdate({
        target: postgresShopifySessions.id,
        set: {
          accessToken: "",
          isOnline: false,
          shop: SEED_SHOP_DOMAIN,
          state: "seed-state",
        },
      })
      .returning({
        id: postgresShopifySessions.id,
        shop: postgresShopifySessions.shop,
      });
    const [file] = await db
      .insert(postgresFiles)
      .values({
        bucketKey: `${SEED_SHOP_DOMAIN}/2026/06/${SEED_FILE_ID}/seed.csv`,
        bucketProvider: DEFAULT_APP_BUCKET_PROVIDERS.MEMORY,
        byteSize: 128,
        contentType: "text/csv",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
        id: SEED_FILE_ID,
        originalName: "seed-2026-06-16-030000.csv",
        safeName: "seed.csv",
        shopDomain: SEED_SHOP_DOMAIN,
        status: "available",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: postgresFiles.id,
        set: {
          bucketProvider: DEFAULT_APP_BUCKET_PROVIDERS.MEMORY,
          byteSize: 128,
          contentType: "text/csv",
          expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
          originalName: "seed-2026-06-16-030000.csv",
          safeName: "seed.csv",
          status: "available",
          updatedAt: now,
        },
      })
      .returning({
        bucketProvider: postgresFiles.bucketProvider,
        id: postgresFiles.id,
        shopDomain: postgresFiles.shopDomain,
        status: postgresFiles.status,
      });

    console.info(
      JSON.stringify(
        {
          file,
          ok: true,
          session,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
