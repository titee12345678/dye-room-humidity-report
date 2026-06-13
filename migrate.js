// One-time schema setup. Run locally: node migrate.js  (needs DATABASE_URL in .env)
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
if (!url) { console.error("❌ Set DATABASE_URL in .env"); process.exit(1); }

const sql = neon(url);

(async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS readings (
        device_mac text NOT NULL,
        ts         timestamp NOT NULL,
        temp real, hum real, dew real, vpd real,
        PRIMARY KEY (device_mac, ts)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS readings_ts_idx ON readings (ts)`;
    console.log("✅ Schema ready (table 'readings')");
    process.exit(0);
  } catch (e) {
    console.error("❌ Migrate failed:", e.message);
    process.exit(1);
  }
})();
