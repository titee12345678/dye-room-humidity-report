import { neon } from "@neondatabase/serverless";

// Netlify's Neon integration sets NETLIFY_DATABASE_URL; manual setup uses DATABASE_URL.
const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

if (!url) console.error("DATABASE_URL / NETLIFY_DATABASE_URL not set");

// Do NOT process.exit here — that crashes the serverless function on import.
// Throw lazily so a missing env shows a clear per-request error instead.
export const sql = url
  ? neon(url)
  : () => { throw new Error("DATABASE_URL not configured — set it in Netlify env vars"); };

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
