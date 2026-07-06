import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireD1SeedTarget } from "./env";

const SEED_SHOP_DOMAIN = "seed-shop.myshopify.com";
const SEED_FILE_ID = "seed-file-00000000-0000-4000-8000-000000000001";
const SEED_SESSION_ID = `offline_${SEED_SHOP_DOMAIN}`;

/**
 * Writes a temporary SQL seed file and executes it with Wrangler D1.
 */
async function main() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24);
  const tempDir = await mkdtemp(join(tmpdir(), "shamt-d1-seed-"));
  const seedFilePath = join(tempDir, "seed.sql");

  try {
    await writeFile(
      seedFilePath,
      createSeedSql({
        expiresAt,
        now,
      }),
      "utf8",
    );

    await executeWranglerD1Seed(seedFilePath);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

/**
 * Creates idempotent SQL for the SQLite/D1 Shopify session and files tables.
 */
function createSeedSql(input: { expiresAt: Date; now: Date }) {
  const now = input.now.getTime();
  const expiresAt = input.expiresAt.getTime();

  return `
INSERT INTO shopify_sessions (
  id,
  shop,
  state,
  isOnline,
  accessToken
) VALUES (
  ${sqlString(SEED_SESSION_ID)},
  ${sqlString(SEED_SHOP_DOMAIN)},
  'seed-state',
  0,
  ''
) ON CONFLICT(id) DO UPDATE SET
  shop = excluded.shop,
  state = excluded.state,
  isOnline = excluded.isOnline,
  accessToken = excluded.accessToken;

INSERT INTO files (
  id,
  shop_domain,
  original_name,
  safe_name,
  content_type,
  byte_size,
  bucket_provider,
  bucket_key,
  status,
  expires_at,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  ${sqlString(SEED_FILE_ID)},
  ${sqlString(SEED_SHOP_DOMAIN)},
  'seed-2026-06-16-030000.csv',
  'seed.csv',
  'text/csv',
  128,
  'r2',
  ${sqlString(`${SEED_SHOP_DOMAIN}/2026/06/${SEED_FILE_ID}/seed.csv`)},
  'available',
  ${expiresAt},
  ${now},
  ${now},
  NULL
) ON CONFLICT(id) DO UPDATE SET
  original_name = excluded.original_name,
  safe_name = excluded.safe_name,
  content_type = excluded.content_type,
  byte_size = excluded.byte_size,
  bucket_provider = excluded.bucket_provider,
  bucket_key = excluded.bucket_key,
  status = excluded.status,
  expires_at = excluded.expires_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at;
`.trimStart();
}

/**
 * Escapes a string literal for this controlled seed SQL payload.
 */
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Executes the seed SQL against remote D1 by default. Set D1_SEED_LOCAL=true
 * for an explicit local Wrangler D1 seed.
 */
async function executeWranglerD1Seed(seedFilePath: string): Promise<void> {
  const { binding, remote, wranglerEnv } = requireD1SeedTarget();
  const args = ["d1", "execute", binding];

  if (wranglerEnv) {
    args.push("--env", wranglerEnv);
  }

  args.push(remote ? "--remote" : "--local", "--file", seedFilePath, "--yes");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("wrangler", args, {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`wrangler ${args.join(" ")} exited with code ${code}`));
    });
  });

  console.info(
    JSON.stringify(
      {
        file: {
          id: SEED_FILE_ID,
          shopDomain: SEED_SHOP_DOMAIN,
        },
        binding,
        ok: true,
        remote,
        session: {
          id: SEED_SESSION_ID,
          shop: SEED_SHOP_DOMAIN,
        },
        wranglerEnv,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
