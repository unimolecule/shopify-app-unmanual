import {
  configSchema,
  type ConfigSchema,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { rootPackagePath } from "./constants";
import { readJsonFile, sanitizePackageName, throwError } from "./utils";

interface RootPackageJson {
  name: string;
}

export interface DeployContext {
  config: ConfigSchema;
  deploymentName: string;
  appUrl: URL;
  webRoot: string;
  nginxConfTarget: string;
}

/**
 * Resolve validated deployment config shared by Node and Cloudflare deploys.
 */
export async function getDeployContext(): Promise<DeployContext> {
  const config = configSchema.parse(process.env);
  const rootPackage = await readRootPackage();
  const deploymentName = `${sanitizePackageName(rootPackage.name)}-server`;
  const appUrl = new URL(config.SHOPIFY_APP_URL);

  return {
    config,
    deploymentName,
    appUrl,
    webRoot: process.env.DEPLOY_WEB_ROOT ?? `/var/www/${deploymentName}/web`,
    nginxConfTarget:
      process.env.DEPLOY_NGINX_CONF_TARGET ??
      `/etc/nginx/conf.d/${appUrl.hostname}.conf`,
  };
}

/**
 * Read and validate the root package metadata used for deploy names.
 */
async function readRootPackage(): Promise<RootPackageJson> {
  const packageJson =
    await readJsonFile<Partial<RootPackageJson>>(rootPackagePath);

  if (!packageJson.name) {
    throwError("server-deploy", "Root package.json must define name");
  }

  return { name: packageJson.name };
}
