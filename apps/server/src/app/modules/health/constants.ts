import { capitalize } from "@unimolecule/utils";
import { ApiPrefixWithVersion } from "@/constants";

const [apiPrefix, apiVersion] = ApiPrefixWithVersion.v1.split("/");
export const apiPath = `/${ApiPrefixWithVersion.v1}/healths` as const;
export const tag = `[${capitalize(apiVersion)}] ${capitalize(apiPrefix)} - Healths`;
export const tags = [tag];
