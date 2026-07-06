import type {
  FileListInput,
  FileLookup,
  FileRecord,
  FilesPage,
  FileStatusUpdate,
} from "../../types";

export interface FilesRepository {
  create: (file: FileRecord) => Promise<void>;
  findById: (input: FileLookup) => Promise<FileRecord | null>;
  list: (input: FileListInput) => Promise<FilesPage>;
  updateStatus: (input: FileStatusUpdate) => Promise<void>;
  delete: (input: FileLookup) => Promise<void>;
}
