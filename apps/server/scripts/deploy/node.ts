import { writeFile } from "node:fs/promises";
import { ensureSuffix } from "@unimolecule/utils";
import { executeCommand } from "@unimolecule/utils/node";
import {
  dockerComposePath,
  nginxConfPath,
  serverDir,
  webDir,
  webDistDir,
} from "./constants";
import { getDeployContext, type DeployContext } from "./shared";

/**
 * Build Node/web assets, restart the container, and reload Nginx.
 */
async function main() {
  const context = await getDeployContext();

  await executeCommand("pnpm", ["--dir", webDir, "run", "build"]);
  await executeCommand("pnpm", ["--dir", serverDir, "run", "build"]);

  await Promise.all([writeDockerCompose(context), writeNginxConfig(context)]);

  await executeCommand("docker", [
    "compose",
    "-f",
    dockerComposePath,
    "up",
    "-d",
    "--build",
  ]);
  await executeCommand("sudo", ["mkdir", "-p", context.webRoot]);
  await executeCommand("sudo", [
    "rsync",
    "-a",
    "--delete",
    ensureSuffix("/", webDistDir),
    ensureSuffix("/", context.webRoot),
  ]);
  await executeCommand("sudo", ["cp", nginxConfPath, context.nginxConfTarget]);
  await executeCommand("sudo", ["nginx", "-t"]);
  await executeCommand("sudo", ["nginx", "-s", "reload"]);
}

/**
 * Write the Node runtime Docker Compose file from validated deploy config.
 */
async function writeDockerCompose({ config, deploymentName }: DeployContext) {
  await writeFile(
    dockerComposePath,
    `services:
  server:
    build:
      context: ../../..
      dockerfile: apps/server/Dockerfile
    image: ${deploymentName}
    container_name: ${deploymentName}
    restart: unless-stopped
    env_file:
      - ../../.env.production
    environment:
      APP_RUNTIME: "${config.APP_RUNTIME}"
      SHOPIFY_APP_URL: "${config.SHOPIFY_APP_URL}"
      APP__SERVER_PORT: "${config.APP__SERVER_PORT}"
    ports:
      - "127.0.0.1:${config.APP__SERVER_PORT}:${config.APP__SERVER_PORT}"
`,
  );
}

/**
 * Write the same-host Nginx config that serves SPA assets and proxies APIs.
 */
async function writeNginxConfig({ appUrl, config, webRoot }: DeployContext) {
  await writeFile(
    nginxConfPath,
    `server {
  listen 80;
  server_name ${appUrl.hostname};

  root ${webRoot};
  index index.html;

  client_max_body_size 2m;

  location /assets/ {
    try_files $uri =404;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location /api/ {
    proxy_pass http://127.0.0.1:${config.APP__SERVER_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /auth {
    proxy_pass http://127.0.0.1:${config.APP__SERVER_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /webhooks {
    proxy_pass http://127.0.0.1:${config.APP__SERVER_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
