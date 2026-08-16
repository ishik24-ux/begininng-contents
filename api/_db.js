import { neon } from '@neondatabase/serverless';

let sqlClient;
export function db() {
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function ensureSchema() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS app_content (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS invites (token text PRIMARY KEY, used boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS applications (id bigserial PRIMARY KEY, name text NOT NULL, email text NOT NULL, password_hash text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now())`;
}

