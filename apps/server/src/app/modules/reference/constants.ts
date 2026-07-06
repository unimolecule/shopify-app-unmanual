import { capitalize } from "@unimolecule/utils";
import { getEnvProvider } from "@/infra/provider";

const env = getEnvProvider();

export const apiPath = `/${env.APP_API_PREFIX}/references`;
export const tag = `${capitalize(env.APP_API_PREFIX)} - References`;
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
