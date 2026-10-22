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
    mfNow: "지금",
    mfToday: "오늘",
    mfFeelsLike: "체감",
    mfRain: "강수",
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
    mfNow: "Now",
    mfToday: "Today",
    mfFeelsLike: "Feels like",
    mfRain: "Rain",
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
    mfNow: "Maintenant",
    mfToday: "Aujourd'hui",
    mfFeelsLike: "Ressenti",
    mfRain: "Pluie",
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
  "Pluie": { ko: "비", en: "Rain", icon: "🌧️" },
  "Eclaircies": { ko: "맑은 구간", en: "Sunny spells", icon: "🌤️" },
  "Bancs de brouillard": { ko: "안개 띠", en: "Fog patches", icon: "🌫️" },
  "Brume": { ko: "옅은 안개", en: "Mist", icon: "🌫️" },
  "Brouillard dense": { ko: "짙은 안개", en: "Dense fog", icon: "🌫️" },
  "Variable": { ko: "구름 변화", en: "Variable", icon: "🌥️" },
  "Slight rain": { ko: "약한 비", en: "Slight rain", fr: "Pluie faible", icon: "🌧️" },
  "Overcast sky": { ko: "흐림", en: "Overcast", fr: "Couvert", icon: "☁️" },
};

const weatherIndex = new Map(Object.entries(weatherDescriptions).map(([k, v]) => [k.toLowerCase(), v]));

function weatherEntry(desc) {
  return weatherIndex.get((desc || "").trim().toLowerCase());
}

function translateWeatherDesc(desc) {
  if (!desc) return "";
  const entry = weatherEntry(desc);
  if (!entry) return desc;
  return entry[currentLang] || desc;
}

function weatherIcon(desc) {
  return weatherEntry(desc)?.icon ?? "";
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

const MF_COL_WIDTH = 60;
const MF_HOURS_AHEAD = 24;
const MF_CHART_HEIGHT = 84;
const MF_NIGHT_ICONS = { "☀️": "🌙", "🌤️": "☁️", "🌦️": "🌧️" };
const SVG_NS = "http://www.w3.org/2000/svg";

let mfTodayHours = [];
let mfSelectedKey = null;

function mfEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function mfSvg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Rough sunrise/sunset for Brittany (about 48N, 2W), only used to swap day/night icons.
function mfIsNight(date) {
  const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
  const dayLength = 12.2 + 4 * Math.sin((2 * Math.PI * (doy - 80)) / 365);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  return Math.abs(hour - 12.1) > dayLength / 2;
}

function mfHourIcon(h) {
  const icon = weatherIcon(h.weather_desc);
  return mfIsNight(new Date(h.forecast_for)) ? (MF_NIGHT_ICONS[icon] ?? icon) : icon;
}

function mfClock(date) {
  return date.toLocaleTimeString(LOCALES[currentLang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function mfTemp(v) {
  return v == null ? "–" : `${Math.round(v)}°`;
}

function mfIsNow(h, index, now) {
  return index === 0 && new Date(h.forecast_for) <= now;
}

function mfWeekday(date) {
  return date.toLocaleDateString(LOCALES[currentLang], { weekday: "short" });
}

function mfStartsDay(hours, i) {
  return i > 0 && new Date(hours[i].forecast_for).getDate() !== new Date(hours[i - 1].forecast_for).getDate();
}

function renderMeteoFranceHero(h, isNow, now = new Date()) {
  const L = t();
  const hero = document.getElementById("mf-today-hero");
  const date = new Date(h.forecast_for);
  document.getElementById("mf-today").classList.toggle("is-night", mfIsNight(date));

  let timeLabel = mfClock(date);
  if (isNow) timeLabel = L.mfNow;
  else if (date.toDateString() !== now.toDateString()) timeLabel = `${mfWeekday(date)} ${timeLabel}`;

  const main = mfEl("div", "mf-hero-main");
  main.append(mfEl("span", "mf-hero-time", timeLabel), mfEl("span", "mf-hero-temp", mfTemp(h.temp_c)));

  const sky = mfEl("div", "mf-hero-sky");
  sky.append(mfEl("span", "mf-hero-icon", mfHourIcon(h)), mfEl("span", "mf-hero-desc", translateWeatherDesc(h.weather_desc)));

  const wind = mfEl("span", "mf-hero-value");
  if (h.wind_direction != null && h.wind_direction >= 0) {
    const arrow = mfEl("span", "mf-arrow", "↑");
    arrow.style.transform = `rotate(${h.wind_direction + 180}deg)`;
    wind.append(arrow, " ");
  }
  wind.append(h.wind_speed == null ? "–" : `${Math.round(h.wind_speed * 3.6)} km/h`);

  const rows = [
    [L.meteofranceWindLabel, wind],
    [L.metricLabels.humidity, h.humidity == null ? "–" : `${Math.round(h.humidity)}%`],
    [L.mfRain, h.rain_1h == null ? "–" : `${h.rain_1h} mm`],
    [L.mfFeelsLike, mfTemp(h.windchill_c)],
  ];
  const details = mfEl("ul", "mf-hero-details");
  for (const [label, value] of rows) {
    const li = mfEl("li");
    const v = mfEl("span", "mf-hero-value");
    v.append(value);
    li.append(mfEl("span", "mf-hero-label", label), v);
    details.append(li);
  }

  hero.replaceChildren(main, sky, details);
}

function mfBuildChart(hours) {
  const width = hours.length * MF_COL_WIDTH;
  const height = MF_CHART_HEIGHT;
  const padTop = 26;
  const padBottom = 12;
  const svg = mfSvg("svg", { width, height, viewBox: `0 0 ${width} ${height}` });

  const known = hours.map((h) => h.temp_c).filter((v) => v != null);
  if (!known.length) return svg;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const y = (v) => padTop + ((max - v) / span) * (height - padTop - padBottom);

  const points = [];
  hours.forEach((h, i) => {
    if (h.temp_c != null) points.push({ i, x: i * MF_COL_WIDTH + MF_COL_WIDTH / 2, y: y(h.temp_c), temp: h.temp_c });
  });

  hours.forEach((_, i) => {
    if (mfStartsDay(hours, i)) svg.append(mfSvg("line", { class: "mf-chart-break", x1: i * MF_COL_WIDTH, x2: i * MF_COL_WIDTH, y1: 0, y2: height }));
  });

  const line = points.map((p, k) => `${k ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  svg.append(mfSvg("path", { class: "mf-chart-line", d: line }));
  for (const p of points) {
    svg.append(mfSvg("circle", { class: "mf-chart-dot", "data-index": p.i, cx: p.x, cy: p.y, r: 3 }));
    const label = mfSvg("text", { class: "mf-chart-label", "data-index": p.i, x: p.x, y: p.y - 10 });
    label.textContent = mfTemp(p.temp);
    svg.append(label);
  }
  return svg;
}

function mfBuildRain(hours) {
  const row = mfEl("div", "mf-strip-rain");
  hours.forEach((h, i) => {
    const cell = mfEl("div", mfStartsDay(hours, i) ? "mf-rain-cell is-day-start" : "mf-rain-cell");
    if (h.rain_1h > 0) {
      const bar = mfEl("div", "mf-rain-bar");
      bar.style.height = `${Math.max(5, Math.min(h.rain_1h / 2, 1) * 22)}px`;
      cell.append(bar, mfEl("span", "", `${h.rain_1h} mm`));
    }
    row.append(cell);
  });
  return row;
}

function mfSelectHour(index, now = new Date()) {
  const h = mfTodayHours[index];
  if (!h) return;
  mfSelectedKey = h.forecast_for;
  renderMeteoFranceHero(h, mfIsNow(h, index, now), now);

  const strip = document.getElementById("mf-today-strip");
  const sel = strip.querySelector(".mf-strip-sel");
  if (sel) sel.style.transform = `translateX(${index * MF_COL_WIDTH}px)`;
  strip.querySelectorAll(".mf-strip-head").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.index) === index)));
  strip.querySelectorAll("[data-index]").forEach((el) => {
    if (el.tagName === "circle") el.setAttribute("r", Number(el.dataset.index) === index ? 5 : 3);
    if (el.tagName === "text") el.classList.toggle("is-selected", Number(el.dataset.index) === index);
  });
}

function renderMeteoFranceToday(fc, now = new Date()) {
  const root = document.getElementById("mf-today");
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  const hours = (fc.hourly || []).filter((h) => new Date(h.forecast_for) >= hourStart).slice(0, MF_HOURS_AHEAD + 1);
  root.hidden = hours.length === 0;
  if (!hours.length) return;

  mfTodayHours = hours;
  const index = Math.max(0, hours.findIndex((h) => h.forecast_for === mfSelectedKey));

  const strip = document.getElementById("mf-today-strip");
  const scrollLeft = strip.scrollLeft;

  const inner = mfEl("div", "mf-strip-inner");
  inner.style.width = `${hours.length * MF_COL_WIDTH}px`;
  const sel = mfEl("div", "mf-strip-sel");
  sel.style.width = `${MF_COL_WIDTH}px`;

  const heads = mfEl("div", "mf-strip-heads");
  hours.forEach((h, i) => {
    const button = mfEl("button", "mf-strip-head");
    button.type = "button";
    button.dataset.index = i;
    if (mfStartsDay(hours, i)) button.classList.add("is-day-start");
    button.append(
      mfEl("span", "mf-head-day", mfStartsDay(hours, i) ? mfWeekday(new Date(h.forecast_for)) : ""),
      mfEl("span", "mf-head-time", mfIsNow(h, i, now) ? t().mfNow : mfClock(new Date(h.forecast_for))),
      mfEl("span", "mf-head-icon", mfHourIcon(h)),
    );
    heads.append(button);
  });

  inner.append(sel, heads, mfBuildChart(hours), mfBuildRain(hours));
  inner.addEventListener("click", (e) => {
    const x = e.clientX - inner.getBoundingClientRect().left;
    mfSelectHour(Math.min(hours.length - 1, Math.max(0, Math.floor(x / MF_COL_WIDTH))));
  });
  strip.replaceChildren(inner);
  strip.scrollLeft = scrollLeft;

  mfSelectHour(index, now);
}

function mfDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderMeteoFranceForecast(fc, now = new Date()) {
  const container = document.getElementById("mf-forecast");
  const days = fc.daily.slice(0, 6);
  const lows = days.map((d) => d.temp_min).filter((v) => v != null);
  const highs = days.map((d) => d.temp_max).filter((v) => v != null);
  const min = Math.min(...lows);
  const span = Math.max(...highs) - min || 1;
  const todayKey = mfDateKey(now);
  const locale = LOCALES[currentLang];

  container.replaceChildren(
    ...days.map((d) => {
      const date = new Date(`${d.date}T00:00:00`);
      const isToday = d.date === todayKey;
      const row = mfEl("div", isToday ? "mf-day is-today" : "mf-day");

      const name = mfEl("div", "mf-day-name");
      name.append(
        mfEl("span", "mf-day-label", isToday ? t().mfToday : date.toLocaleDateString(locale, { weekday: "short" })),
        mfEl("span", "mf-day-date", date.toLocaleDateString(locale, { month: "short", day: "numeric" })),
      );

      const sky = mfEl("div", "mf-day-sky");
      sky.append(mfEl("span", "mf-day-desc", translateWeatherDesc(d.weather_desc)));
      if (d.precip_24h > 0) sky.append(mfEl("span", "mf-day-rain", `${d.precip_24h} mm`));

      const range = mfEl("div", "mf-day-range");
      const track = mfEl("span", "mf-range-track");
      if (d.temp_min != null && d.temp_max != null) {
        const fill = mfEl("span", "mf-range-fill");
        fill.style.left = `${((d.temp_min - min) / span) * 100}%`;
        fill.style.width = `${Math.max(((d.temp_max - d.temp_min) / span) * 100, 8)}%`;
        track.append(fill);
      }
      range.append(mfEl("span", "mf-range-lo", mfTemp(d.temp_min)), track, mfEl("span", "mf-range-hi", mfTemp(d.temp_max)));

      row.append(name, mfEl("span", "mf-day-icon", weatherIcon(d.weather_desc)), sky, range);
      return row;
    }),
  );
}

function renderMeteoFrance() {
  const section = document.getElementById("meteofrance");
  if (!lastMFCurrent) return;
  document.getElementById("mf-title").textContent = t().meteofranceTitle;
  renderMeteoFranceCurrent(lastMFCurrent);
  if (lastMFForecast) {
    renderMeteoFranceToday(lastMFForecast);
    renderMeteoFranceForecast(lastMFForecast);
  }
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
