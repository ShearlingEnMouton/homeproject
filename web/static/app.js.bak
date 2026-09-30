const API = "/api/homeproject";
const REFRESH_MS = 60_000;
const STALE_MS = 3 * 60 * 60 * 1000;
const MAGNUS_A = 17.62;
const MAGNUS_B = 243.12;

const ranges = {
  "24h": { hours: 24, bucket: "raw" },
  "7d": { hours: 24 * 7, bucket: "1h" },
  "30d": { hours: 24 * 30, bucket: "1d" },
};

const riskLabels = {
  low: "낮음",
  moderate: "주의",
  high: "높음",
  very_high: "매우 높음",
};

const metrics = {
  temp: {
    label: "온도",
    unit: "°C",
    digits: 1,
    color: "#ef4444",
    fromReading: (r) => r.temp_c,
  },
  humidity: {
    label: "습도",
    unit: "%",
    digits: 1,
    color: "#3b82f6",
    fromReading: (r) => r.humidity,
    bands: [
      { from: 40, to: 60, color: "rgba(22, 163, 74, 0.10)" },
      { from: 70, to: 100, color: "rgba(220, 38, 38, 0.10)" },
    ],
  },
  humidex: {
    label: "체감온도",
    unit: "°C",
    digits: 1,
    color: "#f97316",
    fromReading: (r) => climate(r.temp_c, r.humidity)?.humidex,
  },
  dewPoint: {
    label: "이슬점",
    unit: "°C",
    digits: 1,
    color: "#8b5cf6",
    fromReading: (r) => climate(r.temp_c, r.humidity)?.dewPoint,
  },
  absHumidity: {
    label: "절대습도",
    unit: " g/m³",
    digits: 1,
    color: "#0891b2",
    fromReading: (r) => climate(r.temp_c, r.humidity)?.absHumidity,
  },
  battery: {
    label: "배터리",
    unit: "%",
    digits: 0,
    color: "#16a34a",
    fromReading: (r) => r.battery,
  },
};

let currentDevice = null;
let currentRange = "24h";
let currentMetric = "temp";
let readings = [];
let moldRisk = null;
let expanded = false;

const mobile = window.matchMedia("(max-width: 640px)");
let chart = null;

function climate(tempC, humidity) {
  if (tempC == null || humidity == null || humidity <= 0) return null;
  const gamma = Math.log(humidity / 100) + (MAGNUS_A * tempC) / (MAGNUS_B + tempC);
  const dewPoint = (MAGNUS_B * gamma) / (MAGNUS_A - gamma);
  const saturation = 6.112 * Math.exp((MAGNUS_A * tempC) / (MAGNUS_B + tempC));
  const absHumidity = (216.7 * ((saturation * humidity) / 100)) / (273.15 + tempC);
  const vapour = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPoint)));
  const humidex = tempC + 0.5555 * (vapour - 10);
  return { dewPoint, absHumidity, humidex };
}

async function getJSON(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function formatValue(value, metric) {
  return value == null ? "–" : `${value.toFixed(metric.digits)}${metric.unit}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTick(date) {
  if (date.getHours() === 0 && date.getMinutes() === 0) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTooltipTime(date) {
  const day = `${date.getMonth() + 1}/${date.getDate()}`;
  if (ranges[currentRange].bucket === "1d") return day;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timeAgo(date) {
  const minutes = Math.round((Date.now() - date) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function card(tag, label, value, className = "") {
  const el = document.createElement(tag);
  el.className = `metric ${className}`.trim();
  el.innerHTML = `<span class="label"></span><span class="value"></span>`;
  el.querySelector(".label").textContent = label;
  el.querySelector(".value").textContent = value;
  return el;
}

function metricCard(key, value) {
  const metric = metrics[key];
  const el = card("button", metric.label, formatValue(value, metric), "selectable");
  el.type = "button";
  el.dataset.metric = key;
  el.style.setProperty("--metric-color", metric.color);
  el.addEventListener("click", () => selectMetric(key));
  return el;
}

function showMessage(text) {
  const p = document.createElement("p");
  p.className = "message";
  p.textContent = text;
  document.getElementById("current").replaceChildren(p);
}

function renderCurrent({ reading, climate: c }) {
  const measured = new Date(reading.measured_at);
  const updated = document.getElementById("updated");
  updated.textContent = `${timeAgo(measured)} 업데이트`;
  updated.title = measured.toLocaleString("ko-KR");
  updated.classList.toggle("stale", Date.now() - measured > STALE_MS);

  moldRisk = c?.mold_risk ?? null;
  renderRiskBadge();
  document.getElementById("current").replaceChildren(
    metricCard("temp", reading.temp_c),
    metricCard("humidity", reading.humidity),
    metricCard("humidex", c?.humidex),
    metricCard("dewPoint", c?.dew_point_c),
    metricCard("absHumidity", c?.absolute_humidity),
    metricCard("battery", reading.battery),
  );
  updateSelection();
  placeChart();
}

function renderRiskBadge() {
  const badge = document.getElementById("risk-badge");
  badge.hidden = currentMetric !== "humidity" || !moldRisk;
  if (badge.hidden) return;
  badge.textContent = `곰팡이 위험 ${riskLabels[moldRisk]}`;
  badge.className = `badge risk-${moldRisk}`;
}

function updateSelection() {
  document.querySelectorAll(".metric.selectable").forEach((el) => {
    const active = el.dataset.metric === currentMetric && (!mobile.matches || expanded);
    el.classList.toggle("selected", active);
    el.setAttribute("aria-expanded", String(active));
  });
}

function placeChart() {
  const chartCard = document.getElementById("chart-card");
  const current = document.getElementById("current");
  if (!mobile.matches) {
    current.after(chartCard);
    chartCard.hidden = false;
    return;
  }
  const row = current.querySelector(`[data-metric="${currentMetric}"]`);
  if (row) row.after(chartCard);
  chartCard.hidden = !expanded;
}

function selectMetric(key) {
  if (mobile.matches) {
    expanded = !(expanded && key === currentMetric);
  }
  const changed = key !== currentMetric;
  currentMetric = key;
  updateSelection();
  placeChart();
  if (changed) drawChart(true);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartHeight() {
  return mobile.matches ? 220 : 300;
}

function chartWidth() {
  return document.getElementById("chart").clientWidth;
}

function gradient(u, color) {
  const { top, height } = u.bbox;
  const g = u.ctx.createLinearGradient(0, top, 0, top + height);
  g.addColorStop(0, `${color}55`);
  g.addColorStop(1, `${color}00`);
  return g;
}

function drawBands(u, bands) {
  if (!bands) return;
  const { ctx, bbox } = u;
  ctx.save();
  ctx.beginPath();
  ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
  ctx.clip();
  for (const band of bands) {
    const top = u.valToPos(band.to, "y", true);
    const bottom = u.valToPos(band.from, "y", true);
    ctx.fillStyle = band.color;
    ctx.fillRect(bbox.left, top, bbox.width, bottom - top);
  }
  ctx.restore();
}

function paddedRange(_, min, max) {
  if (min == null || max == null) return [0, 1];
  const span = max - min || 1;
  return [min - span * 0.2, max + span * 0.2];
}

function updateTooltip(u) {
  const tooltip = document.getElementById("chart-tooltip");
  const idx = u.cursor.idx;
  const value = idx == null ? null : u.data[1][idx];
  if (value == null) {
    tooltip.hidden = true;
    return;
  }
  const time = new Date(u.data[0][idx] * 1000);
  tooltip.textContent = `${formatValue(value, metrics[currentMetric])} · ${formatTooltipTime(time)}`;
  tooltip.style.left = `${u.over.offsetLeft + u.valToPos(u.data[0][idx], "x")}px`;
  tooltip.hidden = false;
}

function createChart(data) {
  const metric = metrics[currentMetric];
  const axis = {
    stroke: cssVar("--muted"),
    font: "12px system-ui, sans-serif",
    grid: { stroke: cssVar("--grid"), width: 1 },
    ticks: { show: false },
  };

  return new uPlot(
    {
      width: chartWidth(),
      height: chartHeight(),
      padding: [16, 8, 0, 0],
      legend: { show: false },
      cursor: {
        y: false,
        drag: { x: false, y: false },
        points: { size: 9, width: 2, fill: cssVar("--card"), stroke: metric.color },
      },
      scales: { y: { range: paddedRange } },
      series: [
        {},
        {
          stroke: metric.color,
          width: 2.5,
          fill: (u) => gradient(u, metric.color),
          paths: uPlot.paths.spline(),
          points: { show: false },
          spanGaps: true,
        },
      ],
      axes: [
        { ...axis, values: (_, ticks) => ticks.map((t) => formatTick(new Date(t * 1000))) },
        { ...axis, size: 60, values: (_, ticks) => ticks.map((v) => `${v}${metric.unit.trim()}`) },
      ],
      hooks: {
        drawClear: [(u) => drawBands(u, metric.bands)],
        setCursor: [updateTooltip],
      },
    },
    data,
    document.getElementById("chart"),
  );
}

function stat(label, value) {
  const el = document.createElement("div");
  el.innerHTML = `<span class="label"></span><span class="stat-value"></span>`;
  el.querySelector(".label").textContent = label;
  el.querySelector(".stat-value").textContent = formatValue(value, metrics[currentMetric]);
  return el;
}

function renderSummary(values) {
  const summary = document.getElementById("chart-summary");
  const valid = values.filter((v) => v != null);
  if (!valid.length) {
    summary.textContent = "이 기간에 데이터가 없어요.";
    return;
  }
  const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  summary.replaceChildren(
    stat("최저", Math.min(...valid)),
    stat("평균", avg),
    stat("최고", Math.max(...valid)),
  );
}

function drawChart(recreate = false) {
  const metric = metrics[currentMetric];
  const data = [
    readings.map((r) => Date.parse(r.measured_at) / 1000),
    readings.map((r) => metric.fromReading(r) ?? null),
  ];

  document.getElementById("chart-title").textContent = metric.label;
  renderRiskBadge();
  renderSummary(data[1]);

  if (chart && !recreate) {
    chart.setData(data);
    return;
  }
  chart?.destroy();
  document.getElementById("chart-tooltip").hidden = true;
  chart = createChart(data);
}

async function loadChart() {
  if (!currentDevice) return;
  const range = ranges[currentRange];
  const from = new Date(Date.now() - range.hours * 3_600_000).toISOString();
  const query = `from=${encodeURIComponent(from)}&bucket=${range.bucket}`;
  const { rows } = await getJSON(`/device/${encodeURIComponent(currentDevice.id)}/readings?${query}`);
  readings = rows;
  drawChart();
}

async function refresh() {
  try {
    const { rows } = await getJSON("/devices?limit=1");
    if (!rows.length) {
      showMessage("등록된 기기가 없어요.");
      return;
    }
    currentDevice = rows[0];
    document.getElementById("device-name").textContent = currentDevice.name;
    renderCurrent(await getJSON(`/device/${encodeURIComponent(currentDevice.id)}/latest`));
    await loadChart();
  } catch (err) {
    console.error(err);
    showMessage("데이터를 불러오지 못했어요.");
  }
}

document.querySelectorAll(".ranges button").forEach((button) => {
  button.addEventListener("click", () => {
    currentRange = button.dataset.range;
    document.querySelectorAll(".ranges button").forEach((b) => b.classList.toggle("active", b === button));
    loadChart().catch(console.error);
  });
});

function resizeChart() {
  chart?.setSize({ width: chartWidth(), height: chartHeight() });
}

new ResizeObserver(resizeChart).observe(document.getElementById("chart"));

mobile.addEventListener("change", () => {
  updateSelection();
  placeChart();
  resizeChart();
});

placeChart();
refresh();
setInterval(refresh, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
