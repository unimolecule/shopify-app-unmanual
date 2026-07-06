import { capitalize } from "@unimolecule/utils";
import { getEnvProvider } from "@/infra/provider";

const env = getEnvProvider();

export const apiPath = `/${env.APP_API_PREFIX}/products`;
export const tag = `${capitalize(env.APP_API_PREFIX)} - Products`;
export const tags = [tag];
