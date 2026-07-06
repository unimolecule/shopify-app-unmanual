import type { IsolateD1Database, IsolateDatabase } from "./isolate";
import type { ProcessDatabase, ProcessPostgresDatabase } from "./process";

export * from "./shared";

export type Database = ProcessDatabase | IsolateDatabase;
export type PostgresDatabase = ProcessPostgresDatabase;
export type D1DatabaseClient = IsolateD1Database;
