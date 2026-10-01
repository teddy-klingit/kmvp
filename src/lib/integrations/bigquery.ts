import { createSign } from "crypto";

type ServiceAccountKey = { client_email: string; private_key: string; project_id: string };

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function getServiceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_BIGQUERY_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Signs a JWT bearer assertion with the service account's private key and exchanges it for a BigQuery-scoped access token — the standard server-to-server OAuth flow for GCP service accounts, no user consent involved. */
async function getBigQueryAccessToken(key: ServiceAccountKey): Promise<string | null> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(key.private_key).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

export type BigQueryResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; reason: "not_configured" | "api_error"; message?: string };

/** Runs a query job against BigQuery, billed to the service account's project. `sql` must fully-qualify any table names (e.g. `bigquery-public-data.google_ads_transparency_center.creative_stats`). */
export async function runBigQuery(sql: string): Promise<BigQueryResult> {
  const key = getServiceAccountKey();
  if (!key) return { ok: false, reason: "not_configured" };

  const token = await getBigQueryAccessToken(key);
  if (!token) return { ok: false, reason: "api_error", message: "Could not obtain a BigQuery access token from the service account key." };

  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${key.project_id}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false }),
  });
  const data = await res.json();

  if (!res.ok) {
    return { ok: false, reason: "api_error", message: data?.error?.message ?? `BigQuery request failed (${res.status}).` };
  }

  const fields: { name: string }[] = data.schema?.fields ?? [];
  const rows = (data.rows ?? []).map((row: { f: { v: unknown }[] }) =>
    Object.fromEntries(fields.map((field, i) => [field.name, row.f[i]?.v]))
  );

  return { ok: true, rows };
}
