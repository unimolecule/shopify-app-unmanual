import type { PaginatedPage, PaginationInput } from "@/shared/models";
import type { SelectPostgresReference } from "@shamt/database/entities";

export type ReferenceRecord = SelectPostgresReference;

export type ReferencesPage = PaginatedPage & {
  references: ReferenceRecord[];
};

export type ReferenceNamespaceLookup = {
  namespace: string;
  shopDomain: string;
};

export type ReferenceLookup = ReferenceNamespaceLookup & {
  id: string;
};

export type ReferenceCodeLookup = ReferenceNamespaceLookup & {
  code: string;
};

export type ReferenceCreateInput = ReferenceNamespaceLookup & {
  code: string;
  enabled?: boolean;
  label: string;
  sortOrder?: number;
};

export type ReferenceUpdateInput = ReferenceLookup & {
  code?: string;
  enabled?: boolean;
  label?: string;
  sortOrder?: number;
};

export type ReferenceListInput = ReferenceNamespaceLookup & {
  enabled?: boolean;
  pagination: PaginationInput;
};

export type ListReferencesInput = ReferenceNamespaceLookup & {
  cursor?: string;
  enabled?: boolean;
  limit?: number;
  page?: number;
};
