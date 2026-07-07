import { capitalize } from "@unimolecule/utils";
import { ApiPrefixWithVersion } from "@/constants";

const [apiPrefix, apiVersion] = ApiPrefixWithVersion.v1.split("/");
export const apiPath = `/${ApiPrefixWithVersion.v1}/references` as const;
export const tag = `[${capitalize(apiVersion)}] ${capitalize(apiPrefix)} - References`;
export const tags = [tag];

export const REFERENCE_NAMESPACES = {
  GENDER: "gender",
} as const;

export const REFERENCE_GENDER_DEFAULTS = [
  {
    code: "male",
    label: "Male",
    sortOrder: 10,
  },
  {
    code: "female",
    label: "Female",
    sortOrder: 20,
  },
] as const;
