import { sql, json } from "../../shared/db.js";

// GET  /api/devices         -> list devices with stats
// POST /api/devices {mac,name} -> set/rename a device (open, like upload)
export default async (req) => {
  try {
    if (req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400); }
      const mac = (body.mac || "").toString().trim().slice(0, 64);
      const name = (body.name || "").toString().trim().slice(0, 80);
      if (!mac) return json({ error: "ไม่พบรหัสเครื่อง (MAC)" }, 400);
      await sql`
        INSERT INTO devices (device_mac, name) VALUES (${mac}, ${name || mac})
        ON CONFLICT (device_mac) DO UPDATE SET name = EXCLUDED.name`;
      return json({ ok: true, mac, name: name || mac });
    }

    const rows = await sql`
      SELECT d.device_mac AS mac,
             COALESCE(NULLIF(d.name, ''), d.device_mac) AS name,
             count(r.*)::int AS count,
             to_char(min(r.ts), 'YYYY-MM-DD') AS min_date,
             to_char(max(r.ts), 'YYYY-MM-DD') AS max_date
      FROM devices d
      LEFT JOIN readings r ON r.device_mac = d.device_mac
      GROUP BY 1, 2
      ORDER BY name`;
    return json({ devices: rows });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
