// Import existing readings into Neon. Run locally: node seed.js [data.json]
// Reads the already-parsed data.json (produced by parse.py). Run migrate.js first.
// NOTE: timestamps are reconstructed in LOCAL time, so run this on the same machine/tz
// that produced data.json (Asia/Bangkok).
import "dotenv/config";
import fs from "fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
if (!url) { console.error("❌ Set DATABASE_URL in .env"); process.exit(1); }

const sql = neon(url);
const file = process.argv[2] || "data.json";
const pad = (n) => String(n).padStart(2, "0");
const localIso = (ms) => {
  const x = new Date(ms);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
};

(async () => {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf-8"));
    const mac = (d.meta && d.meta.mac) || "IBS-TH3-PLUS";
    const s = d.series;
    const rows = s.ts.map((t, i) => ({
      ts: localIso(t), temp: s.temp[i], hum: s.hum[i], dew: s.dew[i], vpd: s.vpd[i],
    }));
    const CH = 2000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CH) {
      const c = rows.slice(i, i + CH);
      const r = await sql`
        INSERT INTO readings (device_mac, ts, temp, hum, dew, vpd)
        SELECT * FROM unnest(
          ${c.map(() => mac)}::text[], ${c.map((x) => x.ts)}::timestamp[],
          ${c.map((x) => x.temp)}::real[], ${c.map((x) => x.hum)}::real[],
          ${c.map((x) => x.dew)}::real[], ${c.map((x) => x.vpd)}::real[])
        ON CONFLICT (device_mac, ts) DO NOTHING
        RETURNING 1`;
      inserted += r.length;
      process.stdout.write(`  ${Math.min(i + CH, rows.length)}/${rows.length}\r`);
    }
    console.log(`\n✅ Seeded: ${inserted} new rows (of ${rows.length}) for device ${mac}`);
    process.exit(0);
  } catch (e) {
    console.error("❌ Seed failed:", e.message);
    process.exit(1);
  }
})();
