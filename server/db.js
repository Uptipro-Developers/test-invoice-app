export { supabase };
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Pool } = pg;

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const configuredMode = String(process.env.DATABASE_MODE || "")
  .trim()
  .toLowerCase();
if (configuredMode && !["supabase", "postgres"].includes(configuredMode)) {
  throw new Error('DATABASE_MODE must be either "supabase" or "postgres".');
}
// Preserve the existing production behaviour when DATABASE_MODE is omitted,
// while allowing local development to force PostgreSQL even if stale Supabase
// variables are still present in the shell.
const useSupabaseApi = configuredMode
  ? configuredMode === "supabase"
  : Boolean(supabaseUrl && supabaseKey);

if (useSupabaseApi && (!supabaseUrl || !supabaseKey)) {
  throw new Error(
    "DATABASE_MODE=supabase requires SUPABASE_URL and a Supabase service/publishable key.",
  );
}

const supabase = useSupabaseApi
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === "true";
}

function buildPoolConfig() {
  const useSsl = parseBoolean(
    process.env.DB_SSL,
    Boolean(process.env.DATABASE_URL),
  );
  const rejectUnauthorized = parseBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
    false,
  );

  return {
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || "localhost",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "free_invoice",
    ssl: useSsl ? { rejectUnauthorized } : false,
  };
}

const pool = useSupabaseApi ? null : new Pool(buildPoolConfig());

export { pool };

export function hasDatabase() {
  return Boolean(supabase || pool);
}

export function getPersistenceMode() {
  return useSupabaseApi ? "supabase-api" : "postgres";
}

export async function initDb() {
  if (useSupabaseApi) return;

  // profiles: account records backing /api/auth and per-user invoice scoping.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'public',
      category TEXT NOT NULL DEFAULT 'public',
      password_hash TEXT,
      buildos_user_id TEXT,
      buildos_supplier_id TEXT,
      buildos_supplier_ref TEXT,
      buildos_sync_status TEXT,
      buildos_sync_error TEXT,
      buildos_synced_at TIMESTAMPTZ,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      reset_token_hash TEXT,
      reset_token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS company TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS buildos_user_id TEXT,
      ADD COLUMN IF NOT EXISTS buildos_supplier_id TEXT,
      ADD COLUMN IF NOT EXISTS buildos_supplier_ref TEXT,
      ADD COLUMN IF NOT EXISTS buildos_sync_status TEXT,
      ADD COLUMN IF NOT EXISTS buildos_sync_error TEXT,
      ADD COLUMN IF NOT EXISTS buildos_synced_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS reset_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id BIGSERIAL PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      client_email TEXT,
      sender_company_name TEXT,
      total NUMERIC(14, 2) DEFAULT 0,
      currency TEXT NOT NULL,
      template TEXT NOT NULL,
      privacy_policy_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      downloaded_at TIMESTAMPTZ,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      profile_id UUID REFERENCES profiles(id),
      status TEXT NOT NULL DEFAULT 'draft',
      buildos_quote_id TEXT
    )
  `);
  await pool.query(`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id),
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS buildos_quote_id TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id BIGSERIAL PRIMARY KEY,
      profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      requester JSONB,
      materials JSONB NOT NULL DEFAULT '[]'::jsonb,
      pricing JSONB,
      amount NUMERIC(14, 2),
      currency TEXT NOT NULL DEFAULT 'NGN',
      buildos_ref TEXT UNIQUE,
      buildos_event TEXT,
      buildos_quote_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE requests
      ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received',
      ADD COLUMN IF NOT EXISTS requester JSONB,
      ADD COLUMN IF NOT EXISTS materials JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS pricing JSONB,
      ADD COLUMN IF NOT EXISTS amount NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN',
      ADD COLUMN IF NOT EXISTS buildos_ref TEXT,
      ADD COLUMN IF NOT EXISTS buildos_event TEXT,
      ADD COLUMN IF NOT EXISTS buildos_quote_id TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS requests_buildos_ref_key
      ON requests(buildos_ref)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS negotiations (
      id BIGSERIAL PRIMARY KEY,
      invoice_id BIGINT REFERENCES invoices(id) ON DELETE CASCADE,
      sender_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
      proposed_total NUMERIC(14, 2),
      items JSONB,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE negotiations
      ADD COLUMN IF NOT EXISTS items JSONB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS negotiation_messages (
      id BIGSERIAL PRIMARY KEY,
      negotiation_id BIGINT REFERENCES negotiations(id) ON DELETE CASCADE,
      sender_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      invoice_id BIGINT REFERENCES invoices(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS invoices_profile_id_idx ON invoices(profile_id);
    CREATE INDEX IF NOT EXISTS requests_profile_id_idx ON requests(profile_id);
    CREATE INDEX IF NOT EXISTS negotiations_invoice_id_idx ON negotiations(invoice_id);
    CREATE INDEX IF NOT EXISTS notifications_profile_id_idx ON notifications(profile_id);
  `);
}

export async function saveInvoice(invoiceRecord) {
  if (useSupabaseApi) {
    const row = {
      invoice_number: invoiceRecord.invoiceNumber,
      client_email: invoiceRecord.clientEmail,
      sender_company_name: invoiceRecord.senderCompanyName,
      total: invoiceRecord.total || 0,
      currency: invoiceRecord.currency,
      template: invoiceRecord.template,
      privacy_policy_accepted: invoiceRecord.privacyPolicyAccepted,
      downloaded_at: invoiceRecord.downloadedAt,
      payload: invoiceRecord.payload,
      profile_id: invoiceRecord.profileId || null,
      status: invoiceRecord.status || "saved",
      buildos_quote_id: invoiceRecord.buildosQuoteId || null,
    };

    // One BuildOS quote maps to one invoice: submitting directly and then
    // refining in the builder must update the same row, not create a duplicate
    // (duplicates would also break the counter lookup keyed on buildos_quote_id).
    if (row.buildos_quote_id) {
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("buildos_quote_id", row.buildos_quote_id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { data, error } = await supabase
          .from("invoices")
          .update(row)
          .eq("id", existing.id)
          .select("id, created_at")
          .single();
        if (error) throw new Error(error.message || "Supabase update failed.");
        return data;
      }
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert(row)
      .select("id, created_at")
      .single();

    if (error) {
      throw new Error(error.message || "Supabase insert failed.");
    }

    return data;
  }

  const query = `
    INSERT INTO invoices (
      invoice_number,
      client_email,
      sender_company_name,
      total,
      currency,
      template,
      privacy_policy_accepted,
      downloaded_at,
      payload,
      profile_id,
      status,
      buildos_quote_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id, invoice_number, created_at
  `;

  const values = [
    invoiceRecord.invoiceNumber,
    invoiceRecord.clientEmail,
    invoiceRecord.senderCompanyName,
    invoiceRecord.total || 0,
    invoiceRecord.currency,
    invoiceRecord.template,
    invoiceRecord.privacyPolicyAccepted,
    invoiceRecord.downloadedAt,
    invoiceRecord.payload,
    invoiceRecord.profileId || null,
    invoiceRecord.status || "saved",
    invoiceRecord.buildosQuoteId || null,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

export async function getInvoices({ page = 1, limit = 20, profileId } = {}) {
  const offset = (page - 1) * limit;

  if (useSupabaseApi) {
    let query = supabase
      .from("invoices")
      .select(
        "id, invoice_number, client_email, sender_company_name, total, currency, template, privacy_policy_accepted, downloaded_at, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (profileId) query = query.eq("profile_id", profileId);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message || "Supabase query failed.");
    }

    return { invoices: data, total: count };
  }

  const where = profileId ? "WHERE profile_id = $3" : "";
  const rowValues = profileId ? [limit, offset, profileId] : [limit, offset];
  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, invoice_number, client_email, sender_company_name, total, currency, template, privacy_policy_accepted, downloaded_at, created_at
       FROM invoices ${where}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      rowValues,
    ),
    pool.query(
      profileId
        ? `SELECT COUNT(*)::int AS total FROM invoices WHERE profile_id = $1`
        : `SELECT COUNT(*)::int AS total FROM invoices`,
      profileId ? [profileId] : [],
    ),
  ]);

  return { invoices: rowsResult.rows, total: countResult.rows[0].total };
}
