import type {
  ReferenceCodeLookup,
  ReferenceListInput,
  ReferenceLookup,
  ReferenceRecord,
  ReferencesPage,
} from "../../types";

export interface ReferenceRepository {
  create: (record: ReferenceRecord) => Promise<void>;
  delete: (input: ReferenceLookup) => Promise<void>;
  findByCode: (input: ReferenceCodeLookup) => Promise<ReferenceRecord | null>;
  findByCodeIncludingDeleted: (
    input: ReferenceCodeLookup,
  ) => Promise<ReferenceRecord | null>;
  findById: (input: ReferenceLookup) => Promise<ReferenceRecord | null>;
  list: (input: ReferenceListInput) => Promise<ReferencesPage>;
  update: (record: ReferenceRecord) => Promise<void>;
}
