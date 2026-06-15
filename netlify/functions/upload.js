import { sql, json } from "../../shared/db.js";

// POST /api/upload  (open — no password)
// body: { mac, name, rows: [{ts, temp, hum, dew, vpd}] }  -- parsed client-side, sent in chunks
export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400); }

  const mac = (body.mac || "IBS-TH3-PLUS").toString().slice(0, 64);
  const name = (body.name || "").toString().trim().slice(0, 80);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return json({ error: "ไม่มีข้อมูลให้บันทึก" }, 400);
  if (rows.length > 10000) return json({ error: "ส่งทีละไม่เกิน 10000 แถว" }, 413);

  const macs = rows.map(() => mac);
  const tss = rows.map((r) => r.ts);
  const temps = rows.map((r) => r.temp);
  const hums = rows.map((r) => r.hum);
  const dews = rows.map((r) => r.dew);
  const vpds = rows.map((r) => r.vpd);

  try {
    // Register device / set its name (rename only when a name is provided).
    if (name) {
      await sql`INSERT INTO devices (device_mac, name) VALUES (${mac}, ${name})
        ON CONFLICT (device_mac) DO UPDATE SET name = EXCLUDED.name`;
    } else {
      await sql`INSERT INTO devices (device_mac, name) VALUES (${mac}, ${mac})
        ON CONFLICT (device_mac) DO NOTHING`;
    }

    // Single round-trip batch insert (avoids N+1 timeouts). Dedup on (device_mac, ts).
    const inserted = await sql`
      INSERT INTO readings (device_mac, ts, temp, hum, dew, vpd)
      SELECT * FROM unnest(
        ${macs}::text[], ${tss}::timestamp[],
        ${temps}::real[], ${hums}::real[], ${dews}::real[], ${vpds}::real[])
      ON CONFLICT (device_mac, ts) DO NOTHING
      RETURNING 1`;
    const added = inserted.length;
    return json({ received: rows.length, inserted: added, skipped: rows.length - added });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
