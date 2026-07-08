// Before/after comparison — pick two windows (e.g. before vs after installing a fan),
// overlay their daily humidity, and show the change. Data via /api/window.
const TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const FAN_DATE = "2026-07-29"; // 29 ก.ค. 2569 — วันติดพัดลม
const el = (id) => document.getElementById(id);
const num = (v) => (v == null ? null : Number(v));
const pad = (n) => String(n).padStart(2, "0");
const cssVar = (n, fb) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;

function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const p = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(a) - p(b)) / 86400000);
}
function fmtThai(s) { const [y, m, d] = s.split("-").map(Number); return d + " " + TH_MON[m - 1] + " " + (y + 543); }

async function api(path) {
  const r = await fetch(path);
  const j = await r.json().catch(() => ({ error: "การเชื่อมต่อผิดพลาด" }));
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}

let devices = [], charts = [], last = null;
const state = { device: null, minDate: null, maxDate: null };

function destroyCharts() { charts.forEach((c) => { try { c.destroy(); } catch {} }); charts = []; }

/* ---------- render ---------- */
async function render() {
  const days = parseInt(el("baDays").value, 10);
  const aStart = el("baA").value, bStart = el("baB").value;
  if (!aStart || !bStart) return;
  el("baContent").innerHTML = `<div class="note"><div class="spin"></div></div>`;
  const dev = state.device ? `&device=${encodeURIComponent(state.device)}` : "";
  try {
    const [A, B] = await Promise.all([
      api(`/api/window?start=${aStart}&days=${days}${dev}`),
      api(`/api/window?start=${bStart}&days=${days}${dev}`),
    ]);
    last = { A, B, days };
    draw(A, B, days);
  } catch (e) {
    el("baContent").innerHTML = `<div class="note"><div class="big">⚠️</div>โหลดข้อมูลไม่สำเร็จ<br><small>${e.message}</small></div>`;
  }
}

function draw(A, B, days) {
  const BEFORE = cssVar("--before", "#6366f1"), AFTER = cssVar("--after", "#ea580c");
  const nA = num(A.summary.n) || 0, nB = num(B.summary.n) || 0;

  if (!nA && !nB) {
    el("baContent").innerHTML = `<div class="note"><div class="big">📭</div>ยังไม่มีข้อมูลในช่วงที่เลือกทั้งสองช่วง<br>
      <small>ถ้าเป็นช่วงหลังติดพัดลม (${fmtThai(FAN_DATE)}) ให้ <a href="upload.html">อัปโหลดข้อมูลเดือน ก.ค.</a> ก่อน</small></div>`;
    return;
  }

  const dHum = (nA && nB) ? Math.round((num(B.summary.avg_hum) - num(A.summary.avg_hum)) * 10) / 10 : null;
  const dOver = (nA && nB) ? Math.round(num(B.summary.pct_over60) - num(A.summary.pct_over60)) : null;
  const dTemp = (nA && nB) ? Math.round((num(B.summary.avg_temp) - num(A.summary.avg_temp)) * 10) / 10 : null;

  // verdict (lower humidity after = better for dye storage)
  let vBig, vSub, vGrad;
  if (dHum == null) {
    vBig = "มีข้อมูลไม่ครบทั้งสองช่วง"; vSub = `ก่อน ${nA ? "มีข้อมูล" : "ยังไม่มีข้อมูล"} · หลัง ${nB ? "มีข้อมูล" : "ยังไม่มีข้อมูล"}`;
    vGrad = "linear-gradient(135deg,#64748b,#475569)";
  } else if (dHum <= -1) {
    vBig = `✅ ความชื้นลดลง ${Math.abs(dHum)}%`;
    vSub = `เฉลี่ยจาก ${A.summary.avg_hum}% → ${B.summary.avg_hum}% หลังติดพัดลม — ดีต่อการเก็บสีย้อม`;
    vGrad = "linear-gradient(135deg,#16a34a,#0f766e)";
  } else if (dHum >= 1) {
    vBig = `⚠️ ความชื้นเพิ่มขึ้น ${dHum}%`;
    vSub = `เฉลี่ยจาก ${A.summary.avg_hum}% → ${B.summary.avg_hum}% — ยังไม่ดีขึ้น`;
    vGrad = "linear-gradient(135deg,#e11d48,#9f1239)";
  } else {
    vBig = "≈ ความชื้นใกล้เคียงเดิม";
    vSub = `เฉลี่ย ${A.summary.avg_hum}% → ${B.summary.avg_hum}% (แทบไม่ต่างกัน)`;
    vGrad = "linear-gradient(135deg,#0891b2,#0e7490)";
  }

  const tile = (lab, a, b, unit, delta, lowerBetter = true) => {
    let cls = "flat", txt = "±0";
    if (delta != null && Math.abs(delta) >= (unit === "%" ? 1 : 0.1)) {
      const good = lowerBetter ? delta < 0 : delta > 0;
      cls = good ? "good" : "bad";
      txt = (delta > 0 ? "▲ +" : "▼ ") + Math.abs(delta) + unit;
    } else if (delta == null) { txt = "—"; }
    return `<div class="ba-tile"><span class="lab">${lab}</span>
      <span class="ab"><span class="a">${a == null ? "—" : a + unit}</span><span class="arr">→</span><span class="b">${b == null ? "—" : b + unit}</span></span>
      <span class="delta ${cls}">${txt}</span></div>`;
  };

  // align each window's daily avg onto offset 0..days-1 (shared by chart + table)
  const arrFor = (W) => {
    const a = new Array(days).fill(null);
    for (const r of (W.series || [])) {
      const off = daysBetween(r.t, W.start);
      if (off >= 0 && off < days) a[off] = num(r.hum);
    }
    return a;
  };
  const aA = arrFor(A), aB = arrFor(B);

  // daily before-vs-after comparison table
  let trows = "";
  for (let i = 0; i < days; i++) {
    const a = aA[i], b = aB[i];
    if (a == null && b == null) continue;
    const dd = (a != null && b != null) ? Math.round((b - a) * 10) / 10 : null;
    const cls = dd == null ? "mut" : dd <= -0.1 ? "dn" : dd >= 0.1 ? "up" : "mut";
    const dtxt = dd == null ? "—" : (dd > 0 ? "+" : "") + dd;
    trows += `<tr><td>วันที่ ${i + 1}</td>
      <td style="color:var(--before)">${a == null ? "—" : a + "%"}</td>
      <td style="color:var(--after)">${b == null ? "—" : b + "%"}</td>
      <td class="badelta ${cls}">${dtxt}</td></tr>`;
  }
  const tableCard = trows ? `
    <div class="card pad" style="padding:14px">
      <div class="chart-head" style="padding:0 4px 4px"><div class="chart-title">ตารางเทียบรายวัน</div>
        <div class="chart-sub">Δ ติดลบ = ความชื้นลดลง (ดีขึ้น) · A เริ่ม ${fmtThai(A.start)} · B เริ่ม ${fmtThai(B.start)}</div></div>
      <div class="table-scroll"><table><thead><tr><th>วัน</th><th>ก่อน (A)</th><th>หลัง (B)</th><th>Δ</th></tr></thead><tbody>${trows}</tbody></table></div>
    </div>` : "";

  el("baContent").innerHTML = `
    <div class="ba-verdict" style="background:${vGrad}">
      <div class="vlabel">A · ${fmtThai(A.start)} ถึง ${fmtThai(addDays(A.start, days - 1))} &nbsp;|&nbsp; B · ${fmtThai(B.start)} ถึง ${fmtThai(addDays(B.start, days - 1))}</div>
      <div class="vbig">${vBig}</div>
      <div class="vsub">${vSub}</div>
    </div>
    <div class="ba-tiles">
      ${tile("💧 ความชื้นเฉลี่ย", num(A.summary.avg_hum), num(B.summary.avg_hum), "%", dHum, true)}
      ${tile("📊 เวลาที่เกิน 60%", num(A.summary.pct_over60), num(B.summary.pct_over60), "%", dOver, true)}
      ${tile("🌡️ อุณหภูมิเฉลี่ย", num(A.summary.avg_temp), num(B.summary.avg_temp), "°", dTemp, true)}
    </div>
    <div class="card chart-card">
      <div class="chart-head"><div class="chart-title">ความชื้นเฉลี่ยรายวัน — ซ้อนทับ ก่อน vs หลัง</div>
        <div class="chart-sub">แกน = วันที่นับจากวันเริ่มของแต่ละช่วง</div></div>
      <div class="chart-box"><canvas id="baChart"></canvas></div>
      <div class="ba-legend"><span><i style="background:repeating-linear-gradient(90deg,${BEFORE} 0 6px,transparent 6px 10px)"></i>ก่อน (A)</span><span><i style="background:${AFTER}"></i>หลัง (B)</span></div>
    </div>
    ${tableCard}`;

  const labels = Array.from({ length: days }, (_, i) => "วันที่ " + (i + 1));
  const t = { grid: cssVar("--chart-grid", "rgba(19,33,61,.07)"), tick: cssVar("--chart-tick", "#5d6b86"),
    tipBg: cssVar("--chart-tooltip-bg", "rgba(15,23,42,.92)"), tipFg: cssVar("--chart-tooltip-fg", "#f1f5f9") };
  destroyCharts();
  charts.push(new Chart(el("baChart"), {
    type: "line",
    data: { labels, datasets: [
      { label: "ก่อน (A)", data: aA, borderColor: BEFORE, backgroundColor: BEFORE, borderWidth: 2.5, borderDash: [6, 4], tension: .3, pointRadius: 2, spanGaps: true },
      { label: "หลัง (B)", data: aB, borderColor: AFTER, backgroundColor: AFTER, borderWidth: 2.5, tension: .3, pointRadius: 2, spanGaps: true },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: t.tipBg, titleColor: t.tipFg, bodyColor: t.tipFg, padding: 11, cornerRadius: 10,
        callbacks: { label: (i) => i.dataset.label + ": " + (i.parsed.y == null ? "—" : i.parsed.y + "%") } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.tick, maxTicksLimit: 10, font: { size: 10 } } },
        y: { min: 30, max: 100, grid: { color: t.grid }, ticks: { color: t.tick, stepSize: 10, callback: (v) => v + "%" } },
      },
    },
  }));
}

/* ---------- controls ---------- */
el("baDays").addEventListener("change", render);
el("baA").addEventListener("change", render);
el("baB").addEventListener("change", render);
el("baPreset").addEventListener("click", () => {
  el("baDays").value = "14";
  el("baB").value = FAN_DATE;
  el("baA").value = addDays(FAN_DATE, -14);
  render();
});
el("baDev").addEventListener("change", (e) => { state.device = e.target.value; render(); });
window.addEventListener("themechange", () => { if (last) draw(last.A, last.B, last.days); });

(async function init() {
  try {
    const r = await api("/api/devices");
    devices = (r.devices || []).filter((d) => num(d.count) > 0);
    if (!devices.length) {
      el("baContent").innerHTML = `<div class="note"><div class="big">📭</div>ยังไม่มีข้อมูล<br>เริ่มด้วยการ <a href="upload.html">อัปโหลด</a></div>`;
      return;
    }
    el("devRow").style.display = "flex";
    el("baDev").innerHTML = devices.map((d) => `<option value="${d.mac}">${d.name} (${(num(d.count) || 0).toLocaleString()})</option>`).join("");
    const dv = devices[0];
    state.device = dv.mac; state.minDate = dv.min_date; state.maxDate = dv.max_date;
    // defaults: two adjacent windows inside the available data (clean demo until real fan data arrives)
    const span = daysBetween(dv.max_date, dv.min_date) + 1;
    const days = span >= 60 ? 14 : 7;
    el("baDays").value = String(days);
    el("baA").value = dv.min_date;
    el("baB").value = addDays(dv.min_date, days);
    el("baA").min = dv.min_date; el("baB").min = dv.min_date;
    render();
  } catch (e) {
    el("baContent").innerHTML = `<div class="note"><div class="big">⚠️</div>เชื่อมต่อฐานข้อมูลไม่ได้<br><small>${e.message}</small></div>`;
  }
})();
