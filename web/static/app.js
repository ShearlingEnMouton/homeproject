const API = "/api/homeproject";
const REFRESH_MS = 60_000;
const STALE_MS = 3 * 60 * 60 * 1000;
const MAGNUS_A = 17.62;
const MAGNUS_B = 243.12;
const LANG_KEY = "homeproject-lang";
const SUPPORTED_LANGS = ["ko", "en", "fr"];
const LOCALES = { ko: "ko-KR", en: "en-US", fr: "fr-FR" };

const ranges = {
  "24h": { hours: 24, bucket: "raw" },
  "7d": { hours: 24 * 7, bucket: "1h" },
  "30d": { hours: 24 * 30, bucket: "1d" },
};

const i18n = {
  ko: {
    rangeLabels: { "24h": "24시간", "7d": "7일", "30d": "30일" },
    metricLabels: {
      temp: "온도",
      humidity: "습도",
      humidex: "체감온도",
      dewPoint: "이슬점",
      absHumidity: "절대습도",
      battery: "배터리",
    },
    riskLabels: { low: "낮음", moderate: "주의", high: "높음", very_high: "매우 높음" },
    moldRisk: (risk) => `곰팡이 위험 ${risk}`,
    justNow: "방금",
    minutesAgo: (n) => `${n}분 전`,
    hoursAgo: (n) => `${n}시간 전`,
    daysAgo: (n) => `${n}일 전`,
    updated: (ago) => `${ago} 업데이트`,
    noDataRange: "이 기간에 데이터가 없어요.",
    statMin: "최저",
    statAvg: "평균",
    statMax: "최고",
    noDevices: "등록된 기기가 없어요.",
    loadError: "데이터를 불러오지 못했어요.",
    meteofranceTitle: "실외 날씨",
    meteofranceWindLabel: "풍속",
    meteofranceNoData: "날씨 데이터가 아직 없어요.",
  },
  en: {
    rangeLabels: { "24h": "24h", "7d": "7d", "30d": "30d" },
    metricLabels: {
      temp: "Temperature",
      humidity: "Humidity",
      humidex: "Humidex",
      dewPoint: "Dew point",
      absHumidity: "Abs. humidity",
      battery: "Battery",
    },
    riskLabels: { low: "Low", moderate: "Moderate", high: "High", very_high: "Very high" },
    moldRisk: (risk) => `Mold risk: ${risk}`,
    justNow: "just now",
    minutesAgo: (n) => `${n}m ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
    updated: (ago) => `Updated ${ago}`,
    noDataRange: "No data for this period.",
    statMin: "Min",
    statAvg: "Avg",
    statMax: "Max",
    noDevices: "No devices registered.",
    loadError: "Failed to load data.",
    meteofranceTitle: "Outdoor weather",
    meteofranceWindLabel: "Wind",
    meteofranceNoData: "No weather data yet.",
  },
  fr: {
    rangeLabels: { "24h": "24h", "7d": "7j", "30d": "30j" },
    metricLabels: {
      temp: "Température",
      humidity: "Humidité",
      humidex: "Humidex",
      dewPoint: "Point de rosée",
      absHumidity: "Humidité absolue",
      battery: "Batterie",
    },
    riskLabels: { low: "Faible", moderate: "Modéré", high: "Élevé", very_high: "Très élevé" },
    moldRisk: (risk) => `Risque de moisissure : ${risk}`,
    justNow: "à l'instant",
    minutesAgo: (n) => `il y a ${n} min`,
    hoursAgo: (n) => `il y a ${n} h`,
    daysAgo: (n) => `il y a ${n} j`,
    updated: (ago) => `Mis à jour ${ago}`,
    noDataRange: "Aucune donnée sur cette période.",
    statMin: "Min",
    statAvg: "Moy",
    statMax: "Max",
    noDevices: "Aucun appareil enregistré.",
    loadError: "Échec du chargement des données.",
    meteofranceTitle: "Météo extérieure",
    meteofranceWindLabel: "Vent",
    meteofranceNoData: "Pas encore de données météo.",
  },
};

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const nav = (navigator.language || "ko").slice(0, 2);
  return SUPPORTED_LANGS.includes(nav) ? nav : "ko";
}

let currentLang = detectLang();

function t() {
  return i18n[currentLang];
}

const metrics = {
  temp: {
    unit: "°C",
    digits: 1,
    color: "#ef4444",
    fromReading: (r) => r.temp_c,
  },
  humidity: {
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
    unit: "°C",
    digits: 1,
    color: "#f97316",
    fromReading: (r) => climate(r.temp_c, r.humidity)?.humidex,
  },
  dewPoint: {
    unit: "°C",
    digits: 1,
    color: "#8b5cf6",
    fromReading: (r) => climate(r.temp_c, r.humidity)?.dewPoint,
  },
  absHumidity: {
    unit: " g/m³",
    digits: 1,
    color: "#0891b2",
    fromReading: (r) => climate(r.temp_c, r.humidity)?.absHumidity,
  },
  battery: {
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
let lastCurrent = null;
let lastMFCurrent = null;
let lastMFForecast = null;

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
  if (minutes < 1) return t().justNow;
  if (minutes < 60) return t().minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t().hoursAgo(hours);
  return t().daysAgo(Math.floor(hours / 24));
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
  const el = card("button", t().metricLabels[key], formatValue(value, metric), "selectable");
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

function renderCurrent(data) {
  lastCurrent = data;
  const { reading, climate: c } = data;
  const measured = new Date(reading.measured_at);
  const updated = document.getElementById("updated");
  updated.textContent = t().updated(timeAgo(measured));
  updated.title = measured.toLocaleString(LOCALES[currentLang]);
  updated.classList.toggle("stale", Date.now() - measured > STALE_MS);

  // On mobile, chart-card may currently live inside #current (placeChart()
  // moves it there). Relocate it out first so replaceChildren() below
  // doesn't rip it out of the document entirely.
  const current = document.getElementById("current");
  const chartCard = document.getElementById("chart-card");
  if (chartCard) current.after(chartCard);

  moldRisk = c?.mold_risk ?? null;
  renderRiskBadge();
  current.replaceChildren(
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
  badge.textContent = t().moldRisk(t().riskLabels[moldRisk]);
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
    summary.textContent = t().noDataRange;
    return;
  }
  const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  summary.replaceChildren(
    stat(t().statMin, Math.min(...valid)),
    stat(t().statAvg, avg),
    stat(t().statMax, Math.max(...valid)),
  );
}

function drawChart(recreate = false) {
  const metric = metrics[currentMetric];
  const data = [
    readings.map((r) => Date.parse(r.measured_at) / 1000),
    readings.map((r) => metric.fromReading(r) ?? null),
  ];

  document.getElementById("chart-title").textContent = t().metricLabels[currentMetric];
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
      showMessage(t().noDevices);
      return;
    }
    currentDevice = rows[0];
    document.getElementById("device-name").textContent = currentDevice.name;
    renderCurrent(await getJSON(`/device/${encodeURIComponent(currentDevice.id)}/latest`));
    await loadChart();
  } catch (err) {
    console.error(err);
    showMessage(t().loadError);
  }
}

function applyRangeLabels() {
  document.querySelectorAll(".ranges button[data-range]").forEach((btn) => {
    btn.textContent = t().rangeLabels[btn.dataset.range];
  });
}

function applyLangSwitch() {
  document.querySelectorAll("#lang-switch button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
}

function setLang(lang) {
  if (lang === currentLang || !SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, currentLang);
  document.documentElement.lang = currentLang;
  applyLangSwitch();
  applyRangeLabels();
  if (lastCurrent) renderCurrent(lastCurrent);
  if (readings.length) drawChart(true);
  renderMeteoFrance();
}

// Meteo-France only returns weather_desc in French; translate the common
// values and attach an emoji icon. Unrecognized strings fall back to the
// original French text rather than showing nothing.
const weatherDescriptions = {
  "Ensoleillé": { ko: "맑음", en: "Sunny", icon: "☀️" },
  "Ciel clair": { ko: "맑음", en: "Clear sky", icon: "☀️" },
  "Peu nuageux": { ko: "구름 조금", en: "Partly cloudy", icon: "🌤️" },
  "Ciel voilé": { ko: "옅은 구름", en: "Hazy sky", icon: "🌥️" },
  "Nuageux": { ko: "구름 많음", en: "Cloudy", icon: "⛅" },
  "Très nuageux": { ko: "매우 흐림", en: "Very cloudy", icon: "🌥️" },
  "Couvert": { ko: "흐림", en: "Overcast", icon: "☁️" },
  "Brouillard": { ko: "안개", en: "Fog", icon: "🌫️" },
  "Brouillard givrant": { ko: "착빙 안개", en: "Freezing fog", icon: "🌫️" },
  "Brume ou bancs de brouillard": { ko: "실안개", en: "Mist / fog patches", icon: "🌫️" },
  "Brumeux": { ko: "실안개", en: "Misty", icon: "🌫️" },
  "Pluie faible": { ko: "약한 비", en: "Light rain", icon: "🌧️" },
  "Pluie modérée": { ko: "보통 비", en: "Moderate rain", icon: "🌧️" },
  "Pluie forte": { ko: "강한 비", en: "Heavy rain", icon: "🌧️" },
  "Pluie faible verglaçante": { ko: "약한 착빙성 비", en: "Light freezing rain", icon: "🌧️" },
  "Pluie verglaçante": { ko: "착빙성 비", en: "Freezing rain", icon: "🌧️" },
  "Averses de pluie": { ko: "소나기", en: "Rain showers", icon: "🌦️" },
  "Averses": { ko: "소나기", en: "Showers", icon: "🌦️" },
  "Averses faibles": { ko: "약한 소나기", en: "Light showers", icon: "🌦️" },
  "Rares averses": { ko: "가끔 소나기", en: "Occasional showers", icon: "🌦️" },
  "Quelques averses": { ko: "약간의 소나기", en: "A few showers", icon: "🌦️" },
  "Averses orageuses": { ko: "뇌우성 소나기", en: "Thundery showers", icon: "⛈️" },
  "Risque d'orages": { ko: "뇌우 가능성", en: "Risk of thunderstorms", icon: "⛈️" },
  "Orages": { ko: "뇌우", en: "Thunderstorms", icon: "⛈️" },
  "Pluie et neige mêlées": { ko: "비와 눈", en: "Rain and snow mixed", icon: "🌨️" },
  "Averses de neige": { ko: "소낙눈", en: "Snow showers", icon: "🌨️" },
  "Neige faible": { ko: "약한 눈", en: "Light snow", icon: "❄️" },
  "Neige": { ko: "눈", en: "Snow", icon: "❄️" },
  "Neige forte": { ko: "강한 눈", en: "Heavy snow", icon: "❄️" },
};

function translateWeatherDesc(desc) {
  if (!desc) return "";
  const entry = weatherDescriptions[desc];
  if (!entry || currentLang === "fr") return desc;
  return entry[currentLang] || desc;
}

function weatherIcon(desc) {
  return weatherDescriptions[desc]?.icon ?? "";
}

function mfFormatDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(LOCALES[currentLang], { weekday: "short" });
}

function renderMeteoFranceCurrent(cur) {
  document.getElementById("mf-updated").textContent = t().updated(timeAgo(new Date(cur.measured_at)));
  const windKmh = cur.wind_speed == null ? null : cur.wind_speed * 3.6;
  document.getElementById("mf-current").replaceChildren(
    card("div", t().metricLabels.temp, cur.temp_c == null ? "–" : `${cur.temp_c.toFixed(1)}°C`),
    card("div", t().metricLabels.humidity, cur.humidity == null ? "–" : `${cur.humidity.toFixed(0)}%`),
    card("div", t().meteofranceWindLabel, windKmh == null ? "–" : `${windKmh.toFixed(0)} km/h`),
  );
}

function renderMeteoFranceForecast(fc) {
  const container = document.getElementById("mf-forecast");
  container.replaceChildren(
    ...fc.daily.slice(0, 6).map((d) => {
      const el = document.createElement("div");
      el.className = "mf-day";
      el.innerHTML = `<span class="mf-day-label"></span><span class="mf-day-icon"></span><span class="mf-day-desc"></span><span class="mf-day-temps"></span>`;
      el.querySelector(".mf-day-label").textContent = mfFormatDay(d.date);
      el.querySelector(".mf-day-icon").textContent = weatherIcon(d.weather_desc);
      el.querySelector(".mf-day-desc").textContent = translateWeatherDesc(d.weather_desc);
      const lo = d.temp_min == null ? "–" : `${Math.round(d.temp_min)}°`;
      const hi = d.temp_max == null ? "–" : `${Math.round(d.temp_max)}°`;
      el.querySelector(".mf-day-temps").textContent = `${lo} / ${hi}`;
      return el;
    }),
  );
}

function renderMeteoFrance() {
  const section = document.getElementById("meteofrance");
  if (!lastMFCurrent) return;
  document.getElementById("mf-title").textContent = t().meteofranceTitle;
  renderMeteoFranceCurrent(lastMFCurrent);
  if (lastMFForecast) renderMeteoFranceForecast(lastMFForecast);
  section.hidden = false;
}

async function loadMeteoFrance() {
  try {
    const [cur, fc] = await Promise.all([getJSON("/meteofrance/current"), getJSON("/meteofrance/forecast")]);
    lastMFCurrent = cur;
    lastMFForecast = fc;
    renderMeteoFrance();
  } catch (err) {
    document.getElementById("meteofrance").hidden = true;
  }
}

document.querySelectorAll("#lang-switch button").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
});

document.querySelectorAll(".ranges button[data-range]").forEach((button) => {
  button.addEventListener("click", () => {
    currentRange = button.dataset.range;
    document.querySelectorAll(".ranges button[data-range]").forEach((b) => b.classList.toggle("active", b === button));
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

document.documentElement.lang = currentLang;
applyLangSwitch();
applyRangeLabels();
placeChart();
refresh();
loadMeteoFrance();
setInterval(() => {
  refresh();
  loadMeteoFrance();
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    loadMeteoFrance();
  }
});
