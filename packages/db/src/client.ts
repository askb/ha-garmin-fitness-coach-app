import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

const connectionString =
  process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";

const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, {
  schema,
  casing: "snake_case",
});
