import { capitalize } from "@unimolecule/utils";
import { getEnvProvider } from "@/infra/provider";

const env = getEnvProvider();

export const apiPath = `/${env.APP_API_PREFIX}/product-exports`;
export const tag = `${capitalize(env.APP_API_PREFIX)} - Product Exports`;
export const tags = [tag];
