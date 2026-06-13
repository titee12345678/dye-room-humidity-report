// Dashboard logic — fetches aggregated data from /api and renders verdict + chart + table.
const API = "/api";
const TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const COL = { blue: "#0ea5e9", orange: "#f97316" };

// state
let state = { range: "month", date: todayStr(), minDate: null, maxDate: null, count: 0 };
let chart = null;

// elements
const el = (id) => document.getElementById(id);
const content = el("content");
const picker = el("picker");

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, "0"); }
function num(v) { return v == null ? null : Number(v); }
function humInfo(v) {
  if (v < 40) return { c: "#d97706", bg: "#fef3c7", label: "แห้ง" };
  if (v < 60) return { c: "#16a34a", bg: "#dcfce7", label: "สบาย" };
  if (v < 70) return { c: "#0284c7", bg: "#e0f2fe", label: "ชื้น" };
  return { c: "#dc2626", bg: "#fee2e2", label: "ชื้นมาก" };
}
async function api(path) {
  const r = await fetch(API + path);
  const j = await r.json().catch(() => ({ error: "การเชื่อมต่อผิดพลาด" }));
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}

/* ---------- picker handling ---------- */
function configurePicker() {
  const r = state.range;
  el("pickerLab").textContent = { day: "วันที่", week: "สัปดาห์ (เลือกวันใดก็ได้)", month: "เดือน", year: "ปี" }[r];
  picker.removeAttribute("min"); picker.removeAttribute("max");
  if (r === "year") {
    picker.type = "number"; picker.min = 2000; picker.max = 2999;
    picker.value = state.date.slice(0, 4);
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
// normalize anchor for month/year so prev/next math is stable
function normalizeAnchor() {
  if (state.range === "month") state.date = state.date.slice(0, 7) + "-01";
  else if (state.range === "year") state.date = state.date.slice(0, 4) + "-01-01";
}

/* ---------- navigation ---------- */
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

/* ---------- main load ---------- */
async function load() {
  normalizeAnchor();
  content.innerHTML = `<div class="note"><div class="spin"></div></div>`;
  try {
    const data = await api(`/summary?range=${state.range}&date=${encodeURIComponent(state.date)}`);
    render(data);
  } catch (e) {
    content.innerHTML = `<div class="note"><div class="big">⚠️</div>โหลดข้อมูลไม่สำเร็จ<br><small>${e.message}</small></div>`;
  }
}

/* ---------- render ---------- */
function render(data) {
  const s = data.summary;
  const n = num(s.n) || 0;
  if (n === 0) {
    content.innerHTML = `<div class="note"><div class="big">📭</div>ไม่มีข้อมูลในช่วง <b>${data.label}</b><br>
      ลองเลือกช่วงอื่น หรือ <a href="upload.html">อัปโหลดข้อมูล</a></div>`;
    return;
  }
  const avgHum = num(s.avg_hum), info = humInfo(avgHum), over60 = num(s.pct_over60);
  const verdictBig = avgHum >= 70 ? "ชื้นมาก — ไม่เหมาะเก็บสีย้อม"
    : avgHum >= 60 ? "ชื้นเกินเกณฑ์เก็บสีย้อม"
    : avgHum >= 40 ? "อยู่ในเกณฑ์ที่ดี" : "ค่อนข้างแห้ง";
  const emoji = avgHum >= 60 ? "⚠️" : "✅";
  const grad = `linear-gradient(135deg,${info.c},${shade(info.c)})`;

  content.innerHTML = `
    <div class="verdict" style="background:${grad}">
      <div class="vtop"><span class="vemoji">${emoji}</span>
        <div><div class="vlabel">ช่วง ${data.label} · ${n.toLocaleString()} ครั้งที่วัด</div>
        <div class="vbig">${verdictBig}</div></div></div>
      <div class="vdesc">ความชื้นเฉลี่ย <b>${avgHum}%</b> · เกินเกณฑ์ 60% เป็นเวลา <b>${over60}%</b> ของช่วงนี้
        ${over60 >= 50 ? "— เสี่ยงสีจับก้อน/เฉดเพี้ยน/ขึ้นรา" : ""}</div>
    </div>
    <div class="stats">
      <div class="stat h"><div class="l">💧 ความชื้นเฉลี่ย</div><div class="v">${avgHum}<span class="u">%</span></div>
        <div class="mm">${num(s.min_hum)}–${num(s.max_hum)}%</div></div>
      <div class="stat t"><div class="l">🌡️ อุณหภูมิเฉลี่ย</div><div class="v">${num(s.avg_temp)}<span class="u">°C</span></div>
        <div class="mm">${num(s.min_temp)}–${num(s.max_temp)}°</div></div>
      <div class="stat o"><div class="l">📊 เกินเกณฑ์ 60%</div><div class="v">${over60}<span class="u">%</span></div>
        <div class="mm">ของเวลา</div></div>
    </div>
    <div class="card chart-card">
      <div class="chart-head"><div class="chart-title" id="chTitle"></div><div class="chart-sub" id="chSub"></div></div>
      <div class="chart-box"><canvas id="chart"></canvas></div>
      <div class="legend" id="lg"></div>
    </div>
    <div id="tableWrap"></div>`;

  drawChart(data);
  drawTable(data);
}

function shade(hex) {
  const m = hex.replace("#", "");
  const r = Math.round(parseInt(m.slice(0,2),16)*.7), g = Math.round(parseInt(m.slice(2,4),16)*.7), b = Math.round(parseInt(m.slice(4,6),16)*.7);
  return `rgb(${r},${g},${b})`;
}
function destroyChart() { if (chart) { try { chart.destroy(); } catch {} chart = null; } }

function drawChart(data) {
  destroyChart();
  const ctx = el("chart");
  const pts = data.points || [];
  if (data.grain === "raw") {
    el("chTitle").textContent = "ความชื้น & อุณหภูมิ รายช่วง 10 นาที";
    el("chSub").textContent = "ตลอดทั้งวัน";
    el("lg").innerHTML = `<span><i style="background:${COL.blue}"></i>ความชื้น %</span><span><i style="background:${COL.orange}"></i>อุณหภูมิ °C</span>`;
    chart = new Chart(ctx, {
      type: "line",
      data: { labels: pts.map(p => p.t.slice(11, 16)), datasets: [
        { label: "ความชื้น", yAxisID: "yH", data: pts.map(p => num(p.hum)), borderColor: COL.blue, borderWidth: 2, tension: .3, pointRadius: 0, fill: true, backgroundColor: "rgba(14,165,233,.12)" },
        { label: "อุณหภูมิ", yAxisID: "yT", data: pts.map(p => num(p.temp)), borderColor: COL.orange, borderWidth: 2, tension: .3, pointRadius: 0 } ] },
      options: baseOpts({ dualAxis: true, xTicks: 8 }),
    });
  } else {
    const isMonth = data.grain === "month";
    el("chTitle").textContent = isMonth ? "ความชื้นเฉลี่ยรายเดือน" : "ความชื้นเฉลี่ยรายวัน";
    el("chSub").textContent = "สีของแท่งบอกระดับ — เขียว=สบาย ฟ้า=ชื้น แดง=ชื้นมาก";
    el("lg").innerHTML = "";
    const labels = pts.map(p => isMonth ? TH_MON[Number(p.t.slice(5,7)) - 1] : (Number(p.t.slice(8,10)) + ""));
    chart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ data: pts.map(p => num(p.hum)),
        backgroundColor: pts.map(p => humInfo(num(p.hum)).c), borderRadius: 6, barPercentage: .8, categoryPercentage: .85 }] },
      options: baseOpts({ bars: true, points: pts, isMonth }),
    });
  }
}

function baseOpts(o) {
  const opt = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: "#15212e", padding: 11, cornerRadius: 10, displayColors: false,
      titleFont: { weight: "600" }, callbacks: {} } },
    scales: {},
  };
  if (o.dualAxis) {
    opt.plugins.tooltip.callbacks.label = (i) => i.dataset.label + ": " + i.parsed.y + (i.dataset.yAxisID === "yH" ? "%" : "°C");
    opt.scales = {
      x: { grid: { display: false }, ticks: { maxTicksLimit: o.xTicks, font: { size: 10 } } },
      yH: { position: "left", grid: { color: "#f0f3f6" }, ticks: { color: COL.blue, callback: (v) => v + "%" } },
      yT: { position: "right", grid: { display: false }, ticks: { color: COL.orange, callback: (v) => v + "°" } },
    };
  }
  if (o.bars) {
    opt.plugins.tooltip.callbacks.label = (i) => {
      const p = o.points[i.dataIndex];
      return ["เฉลี่ย " + num(p.hum) + "% (" + humInfo(num(p.hum)).label + ")", "ช่วง " + num(p.hum_min) + "–" + num(p.hum_max) + "%"];
    };
    opt.scales = {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: o.isMonth ? 12 : 16, font: { size: 10 } } },
      y: { min: 0, max: 100, grid: { color: "#f0f3f6" }, ticks: { stepSize: 25, callback: (v) => v + "%" } },
    };
  }
  return opt;
}

function drawTable(data) {
  const wrap = el("tableWrap");
  if (data.grain === "raw") { wrap.innerHTML = ""; return; } // day view: chart is enough
  const isMonth = data.grain === "month";
  const pts = data.points || [];
  const head = `<thead><tr><th>${isMonth ? "เดือน" : "วันที่"}</th><th>ความชื้นเฉลี่ย</th><th>ต่ำ–สูง</th><th>อุณหภูมิเฉลี่ย</th><th>สูงสุด</th></tr></thead>`;
  const rows = pts.map(p => {
    const h = num(p.hum), info = humInfo(h);
    const lab = isMonth ? (TH_MON[Number(p.t.slice(5,7)) - 1] + " " + (Number(p.t.slice(0,4)) + 543))
                        : (Number(p.t.slice(8,10)) + " " + TH_MON[Number(p.t.slice(5,7)) - 1]);
    return `<tr><td>${lab}</td>
      <td><span class="pill" style="background:${info.bg};color:${info.c}">${h}%</span></td>
      <td style="color:var(--muted)">${num(p.hum_min)}–${num(p.hum_max)}</td>
      <td>${num(p.temp)}°</td><td style="color:var(--muted)">${num(p.temp_max)}°</td></tr>`;
  }).join("");
  wrap.innerHTML = `<div class="card pad" style="padding:14px"><div class="table-scroll"><table>${head}<tbody>${rows}</tbody></table></div></div>`;
}

/* ---------- init ---------- */
function setRange(r) {
  state.range = r;
  document.querySelectorAll("#rangebar button").forEach(b => b.classList.toggle("active", b.dataset.range === r));
  // snap anchor into valid data when possible
  if (state.maxDate && (state.date > state.maxDate)) state.date = state.maxDate;
  configurePicker();
  load();
}

document.querySelectorAll("#rangebar button").forEach(b =>
  b.addEventListener("click", () => setRange(b.dataset.range)));
el("prev").addEventListener("click", () => shift(-1));
el("next").addEventListener("click", () => shift(1));
picker.addEventListener("change", () => { state.date = pickerToDate(); load(); });

(async function init() {
  try {
    const r = await api("/range");
    state.minDate = r.minDate; state.maxDate = r.maxDate; state.count = r.count || 0;
    if (!r.count) {
      el("dataInfo").textContent = "ยังไม่มีข้อมูลในระบบ";
      content.innerHTML = `<div class="note"><div class="big">📭</div>ยังไม่มีข้อมูล<br>
        เริ่มต้นด้วยการ <a href="upload.html">อัปโหลดไฟล์ CSV จากเซนเซอร์</a></div>`;
      return;
    }
    el("dataInfo").innerHTML = `มีข้อมูล <b>${r.count.toLocaleString()}</b> รายการ · ${r.minDate} ถึง ${r.maxDate}`;
    // Deep-link support: ?range=&date= (shareable view links)
    const q = new URLSearchParams(location.search);
    const qr = q.get("range"), qd = q.get("date");
    if (["day", "week", "month", "year"].includes(qr)) state.range = qr;
    state.date = qd || (r.maxDate || todayStr()).slice(0, 7) + "-01"; // default = latest month
    document.querySelectorAll("#rangebar button").forEach(b => b.classList.toggle("active", b.dataset.range === state.range));
    configurePicker();
    load();
  } catch (e) {
    el("dataInfo").textContent = "เชื่อมต่อฐานข้อมูลไม่ได้";
    content.innerHTML = `<div class="note"><div class="big">⚠️</div>ยังเชื่อมต่อฐานข้อมูลไม่ได้<br><small>${e.message}</small><br><br>
      <small>ถ้าเพิ่ง deploy ตรวจว่าตั้งค่า <code>DATABASE_URL</code> ใน Netlify แล้ว และรัน <code>migrate.js</code> แล้ว</small></div>`;
  }
})();
