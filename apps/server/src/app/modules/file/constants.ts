import { capitalize } from "@unimolecule/utils";
import { ApiPrefixWithVersion } from "@/constants";

const [apiPrefix, apiVersion] = ApiPrefixWithVersion.v1.split("/");
export const apiPath = `/${ApiPrefixWithVersion.v1}/files` as const;
export const tag = `[${capitalize(apiVersion)}] ${capitalize(apiPrefix)} - Files`;
export const tags = [tag];
