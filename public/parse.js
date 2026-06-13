// Client-side CSV parser for IBS-TH3-PLUS exports.
// Supports the sensor's UTF-16/Tab format AND plain UTF-8/comma CSV.
// Runs in the browser so we never ship raw files (avoids encoding issues + body limits).

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  let enc = "utf-8", start = 0;
  if (b[0] === 0xff && b[1] === 0xfe) { enc = "utf-16le"; start = 2; }
  else if (b[0] === 0xfe && b[1] === 0xff) { enc = "utf-16be"; start = 2; }
  else if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { enc = "utf-8"; start = 3; }
  return new TextDecoder(enc).decode(b.subarray(start));
}

const pad = (n) => String(n).padStart(2, "0");

function parseTs(s) {
  s = String(s).trim();
  // MM/DD/YYYY HH:MM  (sensor format)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) { const [, mo, d, y, h, mi] = m; return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}:00`; }
  // YYYY-MM-DD HH:MM[:SS]
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) { const [, y, mo, d, h, mi] = m; return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}:00`; }
  return null;
}

const num = (s) => {
  const m = String(s).match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
};

// Returns { mac, rows: [{ts, temp, hum, dew, vpd}], skipped }
export function parseText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let mac = "IBS-TH3-PLUS";
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    if (/^\s*MAC\s*ADDRESS/i.test(line)) {
      const after = line.split(/:(.+)/)[1];
      if (after) mac = after.trim();
      continue;
    }
    const delim = line.includes("\t") ? "\t" : ",";
    const parts = line.split(delim).map((s) => s.trim());
    if (parts.length < 5) { continue; }
    if (/^time/i.test(parts[0])) continue; // header row
    const ts = parseTs(parts[0]);
    if (!ts) { skipped++; continue; }
    const temp = num(parts[1]), hum = num(parts[2]), dew = num(parts[3]), vpd = num(parts[4]);
    if ([temp, hum, dew, vpd].some((v) => v === null)) { skipped++; continue; }
    rows.push({ ts, temp, hum, dew, vpd });
  }
  rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return { mac, rows, skipped };
}

export async function parseFile(file) {
  const buf = await file.arrayBuffer();
  const text = decodeBuffer(buf);
  return parseText(text);
}
