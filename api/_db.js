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
  await sql`CREATE TABLE IF NOT EXISTS app_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint text PRIMARY KEY, subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS video_comments (id bigserial PRIMARY KEY, video_id text NOT NULL, video_title text NOT NULL, student_email text NOT NULL, student_name text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'visible', created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS video_activity (student_email text NOT NULL, student_name text NOT NULL, video_id text NOT NULL, video_title text NOT NULL, progress integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'watching', open_count integer NOT NULL DEFAULT 0, first_viewed_at timestamptz NOT NULL DEFAULT now(), last_viewed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (student_email, video_id))`;
  await sql`CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash text PRIMARY KEY, email text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
  const migration=await sql`SELECT id FROM app_migrations WHERE id='cleanup_20260816_empty_site_v1'`;
  if(!migration.length){
    await sql`DELETE FROM app_content`;
    await sql`DELETE FROM applications`;
    await sql`DELETE FROM invites`;
    await sql`INSERT INTO app_migrations (id) VALUES ('cleanup_20260816_empty_site_v1') ON CONFLICT DO NOTHING`;
  }
}
