// Dashboard logic — fetches aggregated data from /api and renders verdict + chart + table.
const API = "/api";
const TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const COL = { blue: "#0ea5e9", orange: "#f97316" };

// state
let state = { range: "month", date: todayStr(), minDate: null, maxDate: null, count: 0, device: null };
let charts = [];
let devices = [];

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
    const dev = state.device ? `&device=${encodeURIComponent(state.device)}` : "";
    const data = await api(`/summary?range=${state.range}&date=${encodeURIComponent(state.date)}${dev}`);
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

  const mk = Math.min(100, Math.max(0, avgHum));
  content.innerHTML = `
    <div class="verdict" style="background:${grad}">
      <div class="vtop"><span class="vemoji">${emoji}</span>
        <div><div class="vlabel">ช่วง ${data.label} · ${n.toLocaleString()} ครั้งที่วัด</div>
        <div class="vbig">${verdictBig}</div></div></div>
      <div class="vdesc">ความชื้นเฉลี่ย <b>${avgHum}%</b> · เกินเกณฑ์ 60% เป็นเวลา <b>${over60}%</b> ของช่วงนี้
        ${over60 >= 50 ? "— เสี่ยงสีจับก้อน/เฉดเพี้ยน/ขึ้นรา" : ""}</div>
      <div class="scale">
        <div class="bar"><div class="seg" style="flex:40;background:#fcd34d"></div><div class="seg" style="flex:20;background:#4ade80"></div><div class="seg" style="flex:10;background:#38bdf8"></div><div class="seg" style="flex:30;background:#f87171"></div></div>
        <div class="marker" style="left:${mk}%"></div>
        <div class="labels"><span>แห้ง</span><span>สบาย&nbsp;40–60</span><span>ชื้น</span><span>ชื้นมาก&nbsp;70+</span></div>
        <div class="scnote">🎯 เกณฑ์เก็บสีย้อม: ควรต่ำกว่า <b>60%</b> (ช่วงสีเขียว)</div>
      </div>
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
    <div id="tableWrap"></div>
    <div class="card chart-card">
      <div class="chart-head"><div class="chart-title">ช่วงไหนชื้นที่สุด?</div>
        <div class="chart-sub">ค่าเฉลี่ยตามชั่วโมง — ยิ่งเย็นยิ่งชื้น (กลางคืน) ยิ่งร้อนยิ่งชื้นน้อย (กลางวัน)</div></div>
      <div id="hourInsight" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 4px 0"></div>
      <div class="chart-box" style="height:230px"><canvas id="chartHour"></canvas></div>
      <div class="legend"><span><i style="background:${COL.blue}"></i>ความชื้น %</span><span><i style="background:${COL.orange}"></i>อุณหภูมิ °C</span></div>
    </div>
    <div class="h2" style="margin-top:6px"><span class="b"></span>สัดส่วนระดับความชื้น (ช่วงนี้)</div>
    <div class="card pad">
      <div class="dist">
        <div class="donut"><canvas id="chartDist"></canvas>
          <div class="center"><div class="n" id="distBig">0%</div><div class="l">ชื้นมาก</div></div></div>
        <div id="distLegend"></div>
      </div>
    </div>`;

  destroyCharts();
  drawChart(data);
  drawTable(data);
  drawHourly(data);
  drawDist(data);
}

function shade(hex) {
  const m = hex.replace("#", "");
  const r = Math.round(parseInt(m.slice(0,2),16)*.7), g = Math.round(parseInt(m.slice(2,4),16)*.7), b = Math.round(parseInt(m.slice(4,6),16)*.7);
  return `rgb(${r},${g},${b})`;
}
function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch {} }); charts = []; }
function mkChart(ctx, cfg) { const c = new Chart(ctx, cfg); charts.push(c); return c; }

function drawChart(data) {
  const ctx = el("chart");
  const pts = data.points || [];
  if (data.grain === "raw") {
    el("chTitle").textContent = "ความชื้น & อุณหภูมิ รายช่วง 10 นาที";
    el("chSub").textContent = "ตลอดทั้งวัน";
    el("lg").innerHTML = `<span><i style="background:${COL.blue}"></i>ความชื้น %</span><span><i style="background:${COL.orange}"></i>อุณหภูมิ °C</span>`;
    mkChart(ctx, {
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
    mkChart(ctx, {
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

function drawHourly(data) {
  const H = (data.hourly || []).map(h => ({ h: num(h.h), hum: num(h.hum), temp: num(h.temp) }));
  const ins = el("hourInsight");
  if (H.length < 2) { if (ins) ins.innerHTML = ""; return; }
  const top = H.reduce((a, b) => (b.hum > a.hum ? b : a));
  const low = H.reduce((a, b) => (b.hum < a.hum ? b : a));
  if (ins) ins.innerHTML =
    `<div style="background:#eef2ff;border:1px solid #e0e7ff;border-radius:14px;padding:11px 13px">
       <div style="font-size:12.5px;color:#4f46e5;font-weight:600">🌙 ชื้นสุด ~${Math.round(top.hum)}%</div>
       <div style="font-size:12px;color:#6b7c8c;margin-top:2px">ประมาณ ${top.h}:00 น.</div></div>
     <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:11px 13px">
       <div style="font-size:12.5px;color:#ea580c;font-weight:600">☀️ ชื้นน้อยสุด ~${Math.round(low.hum)}%</div>
       <div style="font-size:12px;color:#6b7c8c;margin-top:2px">ประมาณ ${low.h}:00 น.</div></div>`;
  mkChart(el("chartHour"), {
    type: "line",
    data: { labels: H.map(h => h.h), datasets: [
      { label: "ความชื้น", yAxisID: "yH", data: H.map(h => h.hum), borderColor: COL.blue, borderWidth: 2.5, tension: .4, pointRadius: 0, fill: true, backgroundColor: "rgba(14,165,233,.13)" },
      { label: "อุณหภูมิ", yAxisID: "yT", data: H.map(h => h.temp), borderColor: COL.orange, borderWidth: 2.5, tension: .4, pointRadius: 0 } ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#15212e", padding: 11, cornerRadius: 10, displayColors: false,
        callbacks: { title: i => i[0].label + ":00 น.", label: i => i.dataset.label + ": " + i.parsed.y + (i.dataset.yAxisID === "yH" ? "%" : "°C") } } },
      scales: { x: { grid: { display: false }, ticks: { callback: v => v + "น.", maxTicksLimit: 8, font: { size: 9.5 } } },
        yH: { position: "left", grid: { color: "#f0f3f6" }, ticks: { color: COL.blue, callback: v => v + "%" } },
        yT: { position: "right", grid: { display: false }, ticks: { color: COL.orange, callback: v => v + "°" } } } },
  });
}

function drawDist(data) {
  const d = data.dist || {};
  const order = [["dry", "แห้ง", "ต่ำกว่า 40%", "#f59e0b"], ["ideal", "สบาย", "40–60%", "#16a34a"],
    ["humid", "ชื้น", "60–70%", "#0ea5e9"], ["veryhigh", "ชื้นมาก", "เกิน 70%", "#ef4444"]];
  const vals = order.map(o => num(d[o[0]]) || 0);
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  mkChart(el("chartDist"), {
    type: "doughnut",
    data: { labels: order.map(o => o[1]), datasets: [{ data: vals, backgroundColor: order.map(o => o[3]), borderColor: "#fff", borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "66%",
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#15212e", padding: 10, cornerRadius: 10, displayColors: false,
        callbacks: { label: i => i.label + ": " + (i.parsed / total * 100).toFixed(1) + "%" } } } },
  });
  el("distBig").textContent = Math.round(vals[3] / total * 100) + "%";
  el("distLegend").innerHTML = order.map((o, i) => {
    const pct = (vals[i] / total * 100).toFixed(1);
    return `<div class="lv"><span class="sw" style="background:${o[3]}"></span>
      <span class="tx">${o[1]}<small>${o[2]}</small></span><span class="pct" style="color:${o[3]}">${pct}%</span></div>`;
  }).join("");
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

/* ---------- devices ---------- */
function setDataInfo(d) {
  el("dataInfo").innerHTML = `<b>${d.name}</b> · ${(num(d.count) || 0).toLocaleString()} รายการ · ${d.min_date || "—"} ถึง ${d.max_date || "—"}`;
}
function renderDevSelect() {
  const sel = el("devSelect");
  sel.innerHTML = devices.map(d =>
    `<option value="${d.mac}"${d.mac === state.device ? " selected" : ""}>${d.name} (${(num(d.count) || 0).toLocaleString()})</option>`).join("");
  el("devRow").style.display = devices.length > 0 ? "flex" : "none";
}
function applyDevice(mac) {
  const d = devices.find(x => x.mac === mac);
  if (!d) return;
  state.device = mac;
  state.minDate = d.min_date; state.maxDate = d.max_date; state.count = num(d.count) || 0;
  state.date = (d.max_date || todayStr()).slice(0, 7) + "-01"; // latest month of this device
  setDataInfo(d);
  configurePicker();
  load();
}
async function loadDevices(keepMac) {
  const r = await api("/devices");
  devices = (r.devices || []).filter(d => num(d.count) > 0);
  if (!devices.length) {
    el("devRow").style.display = "none";
    el("dataInfo").textContent = "ยังไม่มีข้อมูลในระบบ";
    content.innerHTML = `<div class="note"><div class="big">📭</div>ยังไม่มีข้อมูล<br>
      เริ่มต้นด้วยการ <a href="upload.html">อัปโหลดไฟล์ CSV จากเซนเซอร์</a></div>`;
    return null;
  }
  const q = new URLSearchParams(location.search);
  const want = keepMac || q.get("device");
  const chosen = devices.find(d => d.mac === want) || devices[0];
  state.device = chosen.mac;
  renderDevSelect();
  return chosen;
}

el("devSelect").addEventListener("change", (e) => applyDevice(e.target.value));
el("renameBtn").addEventListener("click", async () => {
  const cur = devices.find(d => d.mac === state.device);
  const name = prompt("ตั้งชื่อเครื่อง (เช่น ห้องเก็บสีหลัก)", cur ? cur.name : "");
  if (name == null) return;
  try {
    await fetch("/api/devices", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mac: state.device, name: name.trim() }) });
    const c = await loadDevices(state.device);
    if (c) setDataInfo(c);
  } catch (e) { alert("เปลี่ยนชื่อไม่สำเร็จ: " + e.message); }
});

(async function init() {
  try {
    const chosen = await loadDevices();
    if (!chosen) return;
    const q = new URLSearchParams(location.search);
    const qr = q.get("range"), qd = q.get("date");
    if (["day", "week", "month", "year"].includes(qr)) state.range = qr;
    document.querySelectorAll("#rangebar button").forEach(b => b.classList.toggle("active", b.dataset.range === state.range));
    state.minDate = chosen.min_date; state.maxDate = chosen.max_date; state.count = num(chosen.count) || 0;
    setDataInfo(chosen);
    state.date = qd || (chosen.max_date || todayStr()).slice(0, 7) + "-01";
    configurePicker();
    load();
  } catch (e) {
    el("dataInfo").textContent = "เชื่อมต่อฐานข้อมูลไม่ได้";
    content.innerHTML = `<div class="note"><div class="big">⚠️</div>ยังเชื่อมต่อฐานข้อมูลไม่ได้<br><small>${e.message}</small><br><br>
      <small>ถ้าเพิ่ง deploy ตรวจว่าตั้งค่า <code>DATABASE_URL</code> ใน Netlify แล้ว</small></div>`;
  }
})();
