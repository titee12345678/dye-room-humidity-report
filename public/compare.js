// Compare page — overlays every device's reading for a period and tells you
// whether the sensors in the room agree (chart + tables + heatmaps + verdict).
const API = "/api";
const TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
// distinct, theme-friendly line colors assigned per device (in list order)
const PALETTE = ["#6366f1", "#f97316", "#10b981", "#e11d48", "#0ea5e9", "#a855f7", "#eab308", "#14b8a6"];
const METRICS = {
  hum:  { label: "ความชื้น", unit: "%",  good: 3,   bad: 6 },
  temp: { label: "อุณหภูมิ", unit: "°C", good: 0.5, bad: 1.5 },
  dew:  { label: "จุดน้ำค้าง", unit: "°C", good: 0.5, bad: 1.5 },
};

function cssVar(n, fb) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; }
function chartTheme() {
  return {
    grid: cssVar("--chart-grid", "rgba(19,33,61,.07)"),
    tick: cssVar("--chart-tick", "#5d6b86"),
    tipBg: cssVar("--chart-tooltip-bg", "rgba(15,23,42,.92)"),
    tipFg: cssVar("--chart-tooltip-fg", "#f1f5f9"),
  };
}

let state = { range: "month", date: todayStr(), metric: "hum", minDate: null, maxDate: null };
let charts = [];
let lastData = null;
let colorByMac = {};

const el = (id) => document.getElementById(id);
const content = el("content");
const picker = el("picker");

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, "0"); }
function num(v) { return v == null ? null : Number(v); }
function r1(v) { return Math.round(v * 10) / 10; }
function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
async function api(path) {
  const r = await fetch(API + path);
  const j = await r.json().catch(() => ({ error: "การเชื่อมต่อผิดพลาด" }));
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}

/* ---------- picker (same behavior as the dashboard) ---------- */
function configurePicker() {
  const r = state.range;
  el("pickerLab").textContent = { day: "วันที่", week: "สัปดาห์ (เลือกวันใดก็ได้)", month: "เดือน", year: "ปี" }[r];
  picker.removeAttribute("min"); picker.removeAttribute("max");
  if (r === "year") {
    picker.type = "number"; picker.min = 2000; picker.max = 2999; picker.value = state.date.slice(0, 4);
  } else if (r === "month") {
    picker.type = "month"; picker.value = state.date.slice(0, 7);
    if (state.minDate) picker.min = state.minDate.slice(0, 7);
    if (state.maxDate) picker.max = state.maxDate.slice(0, 7);
  } else {
    picker.type = "date"; picker.value = state.date;
    if (state.minDate) picker.min = state.minDate;
    if (state.maxDate) picker.max = state.maxDate;
  }
}
function pickerToDate() {
  const v = picker.value;
  if (!v) return state.date;
  if (state.range === "year") return `${v}-01-01`;
  if (state.range === "month") return `${v}-01`;
  return v;
}
function normalizeAnchor() {
  if (state.range === "month") state.date = state.date.slice(0, 7) + "-01";
  else if (state.range === "year") state.date = state.date.slice(0, 4) + "-01-01";
}
function shift(dir) {
  const [y, m, d] = state.date.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (state.range === "day") base.setUTCDate(base.getUTCDate() + dir);
  else if (state.range === "week") base.setUTCDate(base.getUTCDate() + dir * 7);
  else if (state.range === "month") base.setUTCMonth(base.getUTCMonth() + dir);
  else base.setUTCFullYear(base.getUTCFullYear() + dir);
  state.date = base.toISOString().slice(0, 10);
  configurePicker();
  load();
}

/* ---------- load ---------- */
async function load() {
  normalizeAnchor();
  content.innerHTML = `<div class="note"><div class="spin"></div></div>`;
  try {
    const data = await api(`/compare?range=${state.range}&date=${encodeURIComponent(state.date)}`);
    lastData = data;
    colorByMac = {};
    data.devices.forEach((d, i) => { colorByMac[d.mac] = PALETTE[i % PALETTE.length]; });
    render();
  } catch (e) {
    content.innerHTML = `<div class="note"><div class="big">⚠️</div>โหลดข้อมูลไม่สำเร็จ<br><small>${e.message}</small></div>`;
  }
}

/* ---------- labels ---------- */
function bucketLabel(t, grain) {
  if (grain === "raw") return t.slice(11, 16);                       // hourly tick → "14:00"
  if (grain === "month") return TH_MON[Number(t.slice(5, 7)) - 1];   // monthly → "มิ.ย."
  return String(Number(t.slice(8, 10)));                            // daily → day number
}
function rowLabel(t, grain) { // verbose label for tables
  if (grain === "raw") return t.slice(11, 16) + " น.";
  if (grain === "month") return TH_MON[Number(t.slice(5, 7)) - 1] + " " + (Number(t.slice(0, 4)) + 543);
  return Number(t.slice(8, 10)) + " " + TH_MON[Number(t.slice(5, 7)) - 1];
}

/* ---------- render ---------- */
function render() {
  const data = lastData;
  if (!data) return;
  const metric = state.metric, M = METRICS[metric];
  const devices = data.devices || [];

  if (!devices.length) {
    content.innerHTML = `<div class="note"><div class="big">📭</div>ไม่มีข้อมูลในช่วง <b>${data.label}</b><br>
      ลองเลือกช่วงอื่น หรือ <a href="upload.html">อัปโหลดข้อมูล</a></div>`;
    return;
  }

  const ag = (data.agreement && data.agreement[metric]) || { level: "single" };
  const single = ag.level === "single" || devices.length < 2;
  const V = {
    good:   { grad: "linear-gradient(135deg,#16a34a,#0f7a37)", emoji: "✅", big: "เครื่องวัดตรงกันดี" },
    warn:   { grad: "linear-gradient(135deg,#d97706,#a85d05)", emoji: "🟡", big: "ต่างกันเล็กน้อย" },
    bad:    { grad: "linear-gradient(135deg,#e11d48,#a8123a)", emoji: "⚠️", big: "มีเครื่องอ่านต่างผิดปกติ" },
    single: { grad: "linear-gradient(135deg,#6366f1,#4549b5)", emoji: "📟", big: "เทียบไม่ได้" },
  };
  const v = single ? V.single : (V[ag.level] || V.warn);
  const outName = ag.outlier ? (devices.find(d => d.mac === ag.outlier) || {}).name : null;
  const bigText = v.big + (ag.level === "bad" && outName ? ` — ${outName}` : "");
  const desc = single
    ? `ช่วงนี้มีข้อมูลเครื่องเดียว — ต้องมีอย่างน้อย 2 เครื่องที่มีข้อมูลช่วงเดียวกันถึงจะเทียบได้`
    : `ต่างกันเฉลี่ย <b>${ag.gapAvg}${M.unit}</b> · มากสุด <b>${ag.gapMax}${M.unit}</b>
       — เกณฑ์ตรงกันดีคือไม่เกิน <b>${M.good}${M.unit}</b>`;

  const detail = data.grain === "raw" ? "ราย 10 นาที" : data.grain === "month" ? "รายเดือน" : "รายวัน";

  content.innerHTML = `
    <div class="verdict" style="background:${v.grad};margin-top:14px">
      <div class="vtop"><span class="vemoji">${v.emoji}</span>
        <div><div class="vlabel">${M.label} · ช่วง ${data.label} · ${devices.length} เครื่อง</div>
        <div class="vbig">${bigText}</div></div></div>
      <div class="vdesc">${desc}</div>
    </div>
    <div class="card chart-card">
      <div class="chart-head"><div class="chart-title">${M.label}แต่ละเครื่องตามเวลา (${detail})</div>
        <div class="chart-sub">เส้นยิ่งทับกัน = ยิ่งตรงกัน · แตะกราฟเพื่อดูค่าทุกเครื่องในช่วงเดียวกัน</div></div>
      <div class="chart-box"><canvas id="chart"></canvas></div>
      <div class="cmp-legend" id="lg"></div>
    </div>
    <div id="periodWrap"></div>
    <div id="summaryWrap"></div>
    <div id="heatWrap"></div>`;

  destroyCharts();
  drawChart();
  drawLegend();
  drawPeriodTable();
  drawSummaryTable();
  drawHeatmaps();
}

function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch {} }); charts = []; }
function mkChart(ctx, cfg) { const c = new Chart(ctx, cfg); charts.push(c); return c; }

function seriesByMac(metric) {
  const byMac = new Map();
  for (const s of lastData.series || []) {
    if (!byMac.has(s.mac)) byMac.set(s.mac, {});
    byMac.get(s.mac)[s.t] = s[metric];
  }
  return byMac;
}

/* ---------- overlay chart ---------- */
function drawChart() {
  const data = lastData, metric = state.metric, M = METRICS[metric];
  const t = chartTheme();
  const buckets = data.buckets || [];
  const byMac = seriesByMac(metric);
  const datasets = data.devices.map(d => {
    const map = byMac.get(d.mac) || {};
    return {
      label: d.name,
      data: buckets.map(b => (map[b] == null ? null : num(map[b]))),
      borderColor: colorByMac[d.mac], backgroundColor: colorByMac[d.mac],
      borderWidth: 2.2, tension: .3, pointRadius: 0,
      spanGaps: true, // some sensors log hourly, others every 10 min — keep their lines continuous
    };
  });
  mkChart(el("chart"), {
    type: "line",
    data: { labels: buckets.map(b => bucketLabel(b, data.grain)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: t.tipBg, titleColor: t.tipFg, bodyColor: t.tipFg, padding: 11, cornerRadius: 10,
        callbacks: { label: (i) => i.dataset.label + ": " + i.parsed.y + M.unit } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } } },
        y: { grid: { color: t.grid }, ticks: { color: t.tick, callback: (val) => val + M.unit } }, // auto-scale so small gaps are visible
      },
    },
  });
}

function drawLegend() {
  const metric = state.metric, M = METRICS[metric];
  el("lg").innerHTML = lastData.devices.map(d => {
    const avg = d[metric] && d[metric].avg != null ? d[metric].avg + M.unit : "—";
    return `<span class="item"><span class="dot" style="background:${colorByMac[d.mac]}"></span>${d.name}
      <span class="av">เฉลี่ย ${avg}</span></span>`;
  }).join("");
}

/* ---------- per-period comparison table (each row = a time bucket) ---------- */
function periodRows(metric) {
  const data = lastData;
  if (data.grain === "raw") { // aggregate 10-min series into hourly rows so the table stays readable
    const byHour = new Map();
    for (const s of data.series) {
      const val = s[metric]; if (val == null) continue;
      const h = Number(s.t.slice(11, 13));
      if (!byHour.has(h)) byHour.set(h, new Map());
      const m = byHour.get(h), cur = m.get(s.mac) || { s: 0, n: 0 };
      cur.s += val; cur.n++; m.set(s.mac, cur);
    }
    return [...byHour.keys()].sort((a, b) => a - b).map(h => {
      const vals = new Map();
      for (const [mac, c] of byHour.get(h)) vals.set(mac, r1(c.s / c.n));
      return { label: pad(h) + ":00 น.", vals };
    });
  }
  const byT = new Map();
  for (const s of data.series) {
    const val = s[metric]; if (val == null) continue;
    if (!byT.has(s.t)) byT.set(s.t, new Map());
    byT.get(s.t).set(s.mac, val);
  }
  return data.buckets.filter(t => byT.has(t)).map(t => ({ label: rowLabel(t, data.grain), vals: byT.get(t) }));
}

function gapLevel(gap, M) { return gap == null ? "" : gap <= M.good ? "good" : gap <= M.bad ? "warn" : "bad"; }
const LEVEL_PILL = {
  good: "background:var(--ok-bg);color:var(--ok-fg)",
  warn: "background:rgba(217,119,6,.14);color:var(--warn)",
  bad:  "background:var(--err-bg);color:var(--err-fg)",
  "":   "color:var(--muted)",
};

function drawPeriodTable() {
  const metric = state.metric, M = METRICS[metric];
  const devices = lastData.devices;
  const rows = periodRows(metric);
  // short headers (#1, #2…) — the dot color links each one to the full name in the chart legend above
  const head = `<thead><tr><th>ช่วงเวลา</th><th>ต่าง</th>${devices.map((d, i) =>
    `<th title="${d.name}"><span class="hdot" style="background:${colorByMac[d.mac]}"></span>#${i + 1}</th>`).join("")}</tr></thead>`;
  const body = rows.map(r => {
    const present = devices.map(d => r.vals.get(d.mac)).filter(v => v != null);
    const gap = present.length >= 2 ? r1(Math.max(...present) - Math.min(...present)) : null;
    const lv = gapLevel(gap, M);
    const cells = devices.map(d => {
      const v = r.vals.get(d.mac);
      return `<td>${v == null ? "—" : v + M.unit}</td>`;
    }).join("");
    return `<tr><td>${r.label}</td>
      <td><span class="pill" style="${LEVEL_PILL[lv]}">${gap == null ? "—" : gap + M.unit}</span></td>${cells}</tr>`;
  }).join("");
  const unitRow = lastData.grain === "raw" ? "ชั่วโมง" : lastData.grain === "month" ? "เดือน" : "วัน";
  el("periodWrap").innerHTML = `
    <div class="card pad" style="padding:14px;margin-top:14px">
      <div class="chart-title" style="padding:2px 4px 0">ตารางเทียบราย${unitRow} (${M.label})</div>
      <div class="chart-sub" style="padding:0 4px 4px">"ต่าง" = ค่าสูงสุด−ต่ำสุดของเครื่องในช่วงนั้น (เขียว=ตรงกัน แดง=ต่างมาก) · #1–#${devices.length} เรียงตามสีในกราฟด้านบน</div>
      <div class="table-scroll" style="max-height:420px;overflow-y:auto"><table style="min-width:auto">${head}<tbody>${body}</tbody></table></div>
    </div>`;
}

/* ---------- per-device summary table ---------- */
function drawSummaryTable() {
  const metric = state.metric, M = METRICS[metric];
  const devices = lastData.devices;
  const ag = (lastData.agreement && lastData.agreement[metric]) || {};
  const avgs = devices.map(d => num(d[metric] && d[metric].avg)).filter(v => v != null);
  const med = avgs.length ? median(avgs) : null;
  const rows = devices.map(d => {
    const mm = d[metric] || {};
    const avg = num(mm.avg);
    const delta = (avg != null && med != null) ? avg - med : null;
    const dCls = delta == null ? "" : (delta >= 0 ? "pos" : "neg");
    const dTxt = delta == null ? "—" : (delta > 0 ? "+" : "") + r1(delta) + M.unit;
    const isOut = ag.outlier && d.mac === ag.outlier;
    return `<tr class="${isOut ? "out" : ""}">
      <td><span class="hdot" style="background:${colorByMac[d.mac]}"></span>${d.name}${isOut ? '<span class="warnmark">⚠️</span>' : ""}</td>
      <td><b>${avg == null ? "—" : avg + M.unit}</b></td>
      <td class="delta ${dCls}">${dTxt}</td>
      <td style="color:var(--muted)">${mm.min == null ? "—" : mm.min}–${mm.max == null ? "—" : mm.max}</td></tr>`;
  }).join("");
  el("summaryWrap").innerHTML = `
    <div class="card pad" style="padding:14px;margin-top:14px">
      <div class="chart-title" style="padding:2px 4px 0">สรุปต่อเครื่อง (${M.label})</div>
      <div class="chart-sub" style="padding:0 4px 4px">Δ จากค่ากลาง = ห่างจากค่ากลางของกลุ่มเท่าไหร่ · เครื่องที่หลุดกลุ่มมีเครื่องหมาย ⚠️</div>
      <div class="table-scroll"><table style="min-width:auto">
        <thead><tr><th>เครื่อง</th><th>เฉลี่ย</th><th>Δ จากค่ากลาง</th><th>ต่ำ–สูง</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
}

/* ---------- heatmaps (day×hour) ---------- */
// viridis-ish dry→humid scale, shared by all per-device heatmaps so they're comparable
function heatColor(t) {
  const s = [[253,231,37],[122,209,81],[34,168,132],[42,120,142],[65,68,135],[68,1,84]];
  t = Math.max(0, Math.min(1, t));
  const f = t * (s.length - 1), i = Math.floor(f), fr = f - i;
  const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
  const c = (k) => Math.round(a[k] + (b[k] - a[k]) * fr);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}
const HEAT_GRAD = "linear-gradient(90deg,rgb(253,231,37),rgb(122,209,81),rgb(34,168,132),rgb(42,120,142),rgb(65,68,135),rgb(68,1,84))";
// agree→disagree scale for the difference heatmap (light slate → amber → rose)
function diffColor(t) {
  const s = [[226,232,240],[251,191,36],[225,29,72]];
  t = Math.max(0, Math.min(1, t));
  const f = t * (s.length - 1), i = Math.floor(f), fr = f - i;
  const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
  const c = (k) => Math.round(a[k] + (b[k] - a[k]) * fr);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}
const DIFF_GRAD = "linear-gradient(90deg,rgb(226,232,240),rgb(251,191,36),rgb(225,29,72))";

function heatGridHtml(cols, cellFn, labGrain) {
  let html = `<div class="heatgrid">`;
  for (const d of cols) {
    html += `<div class="hl">${rowLabel(d, labGrain)}</div>`;
    for (let h = 0; h < 24; h++) html += cellFn(d, h);
  }
  html += `<div class="hl"></div>`;
  for (let h = 0; h < 24; h++) html += `<div class="hx">${h % 3 === 0 ? h : ""}</div>`;
  html += `</div>`;
  return html;
}

function drawHeatmaps() {
  const wrap = el("heatWrap");
  const data = lastData, metric = state.metric, M = METRICS[metric];
  const heat = data.heat || [];
  if (!heat.length) { wrap.innerHTML = ""; return; }

  const labGrain = data.grain; // "day" → day×hour, "month" → month×hour
  const cols = [...new Set(heat.map(r => r.d))].sort();

  // per-device grid: mac -> (d -> [24]) ; track shared min/max for a common color scale
  const perDev = new Map();
  let mn = Infinity, mx = -Infinity;
  for (const r of heat) {
    const v = r[metric]; if (v == null) continue;
    if (!perDev.has(r.mac)) perDev.set(r.mac, new Map());
    const g = perDev.get(r.mac);
    if (!g.has(r.d)) g.set(r.d, new Array(24).fill(null));
    g.get(r.d)[r.h] = v;
    if (v < mn) mn = v; if (v > mx) mx = v;
  }
  const span = (mx - mn) || 1;

  // difference grid: per (d,h) gap across devices present
  const diff = new Map(); let maxGap = 0;
  const cellVals = new Map(); // "d|h" -> [values]
  for (const r of heat) {
    const v = r[metric]; if (v == null) continue;
    const key = r.d + "|" + r.h;
    if (!cellVals.has(key)) cellVals.set(key, []);
    cellVals.get(key).push(v);
  }
  for (const [key, arr] of cellVals) {
    if (arr.length < 2) continue;
    const g = r1(Math.max(...arr) - Math.min(...arr));
    const [d, h] = key.split("|");
    if (!diff.has(d)) diff.set(d, new Array(24).fill(null));
    diff.get(d)[Number(h)] = g;
    if (g > maxGap) maxGap = g;
  }
  const diffScale = Math.max(maxGap, M.bad) || 1;

  // --- per-device heatmaps (shared scale) ---
  let html = `<div class="h2" style="margin-top:22px"><span class="b"></span>Heatmap ${M.label}รายเครื่อง (วัน×ชั่วโมง)</div>
    <div class="sub2">สีเดียวกัน = อ่านได้ใกล้กัน · ดูว่าทั้งสามเครื่องให้รูปแบบเดียวกันไหม</div>`;
  for (const d of data.devices) {
    const g = perDev.get(d.mac);
    const grid = heatGridHtml(cols, (day, h) => {
      const v = g && g.get(day) ? g.get(day)[h] : null;
      return v == null ? `<div class="hc empty"></div>`
        : `<div class="hc" style="background:${heatColor((v - mn) / span)}" data-kind="dev" data-mac="${d.mac}" data-d="${day}" data-h="${h}"></div>`;
    }, labGrain);
    html += `<div class="card chart-card" style="margin-top:12px">
      <div class="chart-head"><div class="chart-title"><span class="hdot" style="background:${colorByMac[d.mac]}"></span>${d.name}</div></div>
      ${grid}</div>`;
  }
  html += `<div class="heatlegend"><span>${Math.round(mn)}${M.unit}</span><i style="background:${HEAT_GRAD}"></i><span>${Math.round(mx)}${M.unit}</span></div>`;

  // --- difference heatmap ---
  const diffGrid = heatGridHtml(cols, (day, h) => {
    const v = diff.get(day) ? diff.get(day)[h] : null;
    return v == null ? `<div class="hc empty"></div>`
      : `<div class="hc" style="background:${diffColor(v / diffScale)}" data-kind="diff" data-d="${day}" data-h="${h}"></div>`;
  }, labGrain);
  html += `<div class="h2" style="margin-top:24px"><span class="b" style="background:var(--alert)"></span>Heatmap ความต่างระหว่างเครื่อง</div>
    <div class="sub2">ช่องเข้ม = ช่วงเวลานั้นเครื่องอ่านต่างกันมาก (อ่อน/เทา = ตรงกัน) — ${M.label}</div>
    <div class="card chart-card" style="margin-top:12px">${diffGrid}</div>
    <div class="heatlegend"><span>ตรงกัน 0${M.unit}</span><i style="background:${DIFF_GRAD}"></i><span>ต่างมาก ${r1(diffScale)}${M.unit}</span></div>`;

  wrap.innerHTML = html;
  // expose grids so the hover/tap tooltip can read the value under the pointer
  heatLookup = { unit: M.unit, label: M.label, perDev, diff, devices: data.devices, labGrain };
}

/* ---------- heatmap tooltip (point/tap a cell → show its data) ---------- */
let heatLookup = null;
const tip = document.getElementById("cmpTip");

function heatTipHtml(cell) {
  const L = heatLookup; if (!L) return "";
  const d = cell.dataset.d, h = Number(cell.dataset.h);
  const when = `${rowLabel(d, L.labGrain)} · ${pad(h)}:00 น.`;
  if (cell.dataset.kind === "dev") {
    const mac = cell.dataset.mac;
    const dev = L.devices.find(x => x.mac === mac);
    const g = L.perDev.get(mac), v = g && g.get(d) ? g.get(d)[h] : null;
    return `<b>${dev ? dev.name : ""}</b><div class="tw">${when}</div>
      <div class="tv"><span class="dot" style="background:${colorByMac[mac]}"></span>${L.label} <b>${v == null ? "—" : v + L.unit}</b></div>`;
  }
  // difference cell — show the gap plus every device's value at this time
  const gArr = L.diff.get(d), gap = gArr ? gArr[h] : null;
  const lines = L.devices.map((dev, i) => {
    const g = L.perDev.get(dev.mac), v = g && g.get(d) ? g.get(d)[h] : null;
    return v == null ? "" : `<div class="tv"><span class="dot" style="background:${colorByMac[dev.mac]}"></span>#${i + 1} <b>${v}${L.unit}</b></div>`;
  }).join("");
  return `<b>ต่างกัน ${gap == null ? "—" : gap + L.unit}</b><div class="tw">${when}</div>${lines}`;
}

function showTip(clientX, clientY, cell) {
  if (!tip) return;
  tip.innerHTML = heatTipHtml(cell);
  tip.hidden = false;
  const pad2 = 10, tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = clientX + 14, y = clientY + 14;
  if (x + tw + pad2 > window.innerWidth) x = clientX - tw - 14;
  if (y + th + pad2 > window.innerHeight) y = clientY - th - 14;
  tip.style.left = Math.max(pad2, x) + "px";
  tip.style.top = Math.max(pad2, y) + "px";
}
function hideTip() { if (tip) tip.hidden = true; }
const cellUnder = (e) => (e.target.closest ? e.target.closest(".hc[data-kind]") : null);

document.addEventListener("pointermove", (e) => {
  const cell = cellUnder(e);
  if (cell) showTip(e.clientX, e.clientY, cell);
  else if (tip && !tip.hidden) hideTip();
});
document.addEventListener("pointerdown", (e) => { // tap on touch / click on desktop
  const cell = cellUnder(e);
  if (cell) { showTip(e.clientX, e.clientY, cell); e.preventDefault(); } else hideTip();
});
document.addEventListener("scroll", hideTip, true);

/* ---------- controls ---------- */
function setRange(r) {
  state.range = r;
  document.querySelectorAll("#rangebar button").forEach(b => b.classList.toggle("active", b.dataset.range === r));
  if (state.maxDate && state.date > state.maxDate) state.date = state.maxDate;
  configurePicker();
  load();
}
function setMetric(m) {
  state.metric = m;
  document.querySelectorAll("#metricbar button").forEach(b => b.classList.toggle("active", b.dataset.metric === m));
  render(); // re-render from cached data — no refetch
}

document.querySelectorAll("#rangebar button").forEach(b => b.addEventListener("click", () => setRange(b.dataset.range)));
document.querySelectorAll("#metricbar button").forEach(b => b.addEventListener("click", () => setMetric(b.dataset.metric)));
el("prev").addEventListener("click", () => shift(-1));
el("next").addEventListener("click", () => shift(1));
picker.addEventListener("change", () => { state.date = pickerToDate(); load(); });
window.addEventListener("themechange", () => { if (lastData) render(); });

/* ---------- init ---------- */
(async function init() {
  try {
    const r = await api("/devices");
    const devs = (r.devices || []).filter(d => num(d.count) > 0);
    if (devs.length < 2) {
      el("subInfo").textContent = "ต้องมีอย่างน้อย 2 เครื่องถึงจะเทียบกันได้";
      content.innerHTML = `<div class="note"><div class="big">📟</div>
        ${devs.length === 0 ? "ยังไม่มีข้อมูลในระบบ" : "มีเครื่องวัดเครื่องเดียว ยังเทียบไม่ได้"}<br>
        <a href="index.html">← กลับแดชบอร์ด</a> หรือ <a href="upload.html">อัปโหลดข้อมูลอีกเครื่อง</a></div>`;
      return;
    }
    el("subInfo").textContent = `เทียบ ${devs.length} เครื่องในห้องเดียวกัน — อ่านค่าตรงกันไหม`;
    state.minDate = devs.map(d => d.min_date).filter(Boolean).sort()[0] || null;
    state.maxDate = devs.map(d => d.max_date).filter(Boolean).sort().slice(-1)[0] || null;

    const q = new URLSearchParams(location.search);
    const qr = q.get("range"), qd = q.get("date");
    if (["day", "week", "month", "year"].includes(qr)) state.range = qr;
    document.querySelectorAll("#rangebar button").forEach(b => b.classList.toggle("active", b.dataset.range === state.range));
    state.date = qd || (state.maxDate || todayStr()).slice(0, 7) + "-01";
    configurePicker();
    load();
  } catch (e) {
    el("subInfo").textContent = "เชื่อมต่อฐานข้อมูลไม่ได้";
    content.innerHTML = `<div class="note"><div class="big">⚠️</div>ยังเชื่อมต่อฐานข้อมูลไม่ได้<br><small>${e.message}</small></div>`;
  }
})();
