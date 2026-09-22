const KEY = "lumen-journal-v1";
const MOODS = [
  { label: "欢喜", score: 8 },
  { label: "安稳", score: 7 },
  { label: "期待", score: 7 },
  { label: "疲惫", score: 4 },
  { label: "焦虑", score: 3 },
  { label: "低落", score: 2 },
  { label: "烦闷", score: 3 },
];
const LINES = [
  "一行就够，不必把今天写完。",
  "灯还在，字可以很短。",
  "先记下身体哪里紧，再写发生了什么。",
  "写给自己就好，不用写得漂亮。",
  "情绪会过去，纸会帮你留一个边。",
  "今晚只要求诚实，不要求完整。",
  "如果你很累，写三个字也可以。",
];
const MUSIC_FALLBACK = {
  欢喜: "bright acoustic guitar instrumental",
  安稳: "soft piano ambient",
  期待: "hopeful indie instrumental",
  疲惫: "slow night jazz instrumental",
  焦虑: "calm piano no vocals",
  低落: "gentle strings ambient",
  烦闷: "warm acoustic instrumental",
};
const CRISIS_RE = /自杀|不想活|活不下去|结束生命|轻生|自残|割腕|去死|伤害自己|不想活着/;
const HOTLINES = "全国心理援助热线 12356 · 北京心理危机研究与干预中心 010-82951332 · 生命热线 400-821-1215。若有立即危险，请联系当地紧急服务。";

const $ = (id) => document.getElementById(id);
const WEEK = "日一二三四五六";

let db = loadDb();
let draft = null;
let state = { route: "write", busy: false, audioId: null, breath: null, talkAbort: null };
let toastTimer = 0;
let saveTimer = 0;

function emptyDb() {
  return {
    version: 1,
    settings: { apiKey: "", model: "deepseek-flash", baseUrl: "https://api.deepseek.com" },
    entries: [],
  };
}
function loadDb() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries)) return emptyDb();
    data.settings = Object.assign(emptyDb().settings, data.settings || {});
    return data;
  } catch {
    return emptyDb();
  }
}
function saveDb() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    toast("这台浏览器存不下了，记录可能无法保留。");
  }
}
function todayStr(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function parseDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function blankDraft() {
  return {
    id: null,
    date: todayStr(),
    createdAt: "",
    updatedAt: "",
    brief: "",
    title: "",
    diary: "",
    moodScore: 6,
    emotion: "",
    aiScore: null,
    aiEmotion: "",
    triggers: [],
    analysis: "",
    meditation: "",
    movement: "",
    musicQuery: "",
    musicReason: "",
    musicSource: "",
    tracks: [],
    messages: [],
  };
}
function clamp(n, a, b) {
  if (!Number.isFinite(n)) return a;
  return Math.min(b, Math.max(a, n));
}
function isCrisis(text) {
  return CRISIS_RE.test(text || "");
}
function toast(msg) {
  const node = $("toast");
  node.textContent = msg;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4200);
}
function hasKey() {
  return Boolean(db.settings.apiKey && db.settings.apiKey.trim());
}
function scoreColor(score) {
  if (score <= 3) return "#8c3a32";
  if (score <= 6) return "#a56b32";
  return "#1f4a40";
}
function emotionFromScore(score) {
  if (score >= 8) return "欢喜";
  if (score >= 6) return "安稳";
  if (score >= 4) return "疲惫";
  if (score >= 3) return "焦虑";
  return "低落";
}
function dayLine() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const n = Math.floor((Date.now() - start) / 86400000);
  return LINES[n % LINES.length];
}
function lastNDays(n) {
  const days = [];
  const end = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    days.push(todayStr(d));
  }
  return days;
}
function moodByDay(entries) {
  const grouped = new Map();
  entries.forEach((entry) => {
    if (!entry.date || typeof entry.moodScore !== "number") return;
    const list = grouped.get(entry.date) || [];
    list.push(entry.moodScore);
    grouped.set(entry.date, list);
  });
  const out = new Map();
  grouped.forEach((list, day) => {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    out.set(day, Math.round(avg * 10) / 10);
  });
  return out;
}
function latestEntry() {
  return [...db.entries].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null;
}
function todayLatest() {
  const today = todayStr();
  return db.entries
    .filter((entry) => entry.date === today)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null;
}

function endpoint(base) {
  const url = new URL(base || "https://api.deepseek.com");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("接口地址需要以 http 或 https 开头");
  let path = url.pathname.replace(/\/$/, "");
  if (!path || path === "/") path = "/chat/completions";
  else if (!path.endsWith("/chat/completions")) path += "/chat/completions";
  return url.origin + path;
}
function explainHttp(status, text) {
  let msg = "";
  try {
    msg = JSON.parse(text)?.error?.message || "";
  } catch { /* ignore */ }
  if (status === 401) return "这把钥匙不被接受，请检查是否完整复制。";
  if (status === 402) return "DeepSeek 余额不足，需要先充值。";
  if (status === 429) return "请求太密了，歇一会儿再试。";
  if (status === 400) return msg ? `请求没有被接受：${msg.slice(0, 180)}` : "请求格式不被接受。";
  return msg ? `服务没有接住（${status}）：${msg.slice(0, 180)}` : `服务没有接住（${status}）。`;
}
function parseJson(text) {
  const trimmed = String(text || "").trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("模型没有返回可读的结果，可以再试一次。");
}
async function postChat(body, signal) {
  const res = await fetch(endpoint(db.settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${db.settings.apiKey.trim()}`,
    },
    body: JSON.stringify(body),
    referrerPolicy: "no-referrer",
    signal,
  });
  return res;
}
async function complete({ messages, temperature, json, maxTokens, signal }) {
  if (!hasKey()) {
    const err = new Error("NO_KEY");
    err.code = "NO_KEY";
    throw err;
  }
  const body = {
    model: db.settings.model || "deepseek-flash",
    messages,
    temperature,
    stream: false,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
    reasoning_effort: "none",
  };
  if (json) body.response_format = { type: "json_object" };
  let res = await postChat(body, signal);
  if (res.status === 400) {
    const text = await res.text();
    if (/thinking|reasoning_effort|response_format/i.test(text)) {
      delete body.thinking;
      delete body.reasoning_effort;
      delete body.response_format;
      res = await postChat(body, signal);
    } else {
      throw new Error(explainHttp(400, text));
    }
  }
  if (!res.ok) throw new Error(explainHttp(res.status, await res.text()));
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (!content.trim()) throw new Error("模型这次没有写出内容，可以再试一次。");
  return content;
}
async function streamChat({ messages, onDelta, signal }) {
  if (!hasKey()) {
    const err = new Error("NO_KEY");
    err.code = "NO_KEY";
    throw err;
  }
  const body = {
    model: db.settings.model || "deepseek-flash",
    messages,
    temperature: 0.7,
    stream: true,
    max_tokens: 800,
    thinking: { type: "disabled" },
    reasoning_effort: "none",
  };
  let res = await postChat(body, signal);
  if (res.status === 400) {
    const text = await res.text();
    if (/thinking|reasoning_effort/i.test(text)) {
      delete body.thinking;
      delete body.reasoning_effort;
      res = await postChat(body, signal);
    } else {
      throw new Error(explainHttp(400, text));
    }
  }
  if (!res.ok) throw new Error(explainHttp(res.status, await res.text()));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const data = s.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) {
          full += delta;
          onDelta(full);
        }
      } catch { /* partial chunk */ }
    }
  }
  return full.trim();
}

let audiusHost = "";
async function getAudiusHost() {
  if (audiusHost) return audiusHost;
  try {
    const res = await fetch("https://api.audius.co", { referrerPolicy: "no-referrer" });
    const json = await res.json();
    const host = (json.data || []).find(Boolean);
    if (host) {
      audiusHost = String(host).replace(/\/$/, "");
      return audiusHost;
    }
  } catch { /* fallback */ }
  audiusHost = "https://discoveryprovider.audius.co";
  return audiusHost;
}
function mapAudius(track, host) {
  const art = track.artwork || {};
  return {
    id: `audius:${track.id}`,
    title: track.title || "未命名",
    artist: track.user?.name || "Audius",
    artwork: art["150x150"] || art["480x480"] || "",
    duration: Number(track.duration) || 0,
    stream: `${host}/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=lumenjournal`,
    source: "Audius",
  };
}
async function searchAudius(query) {
  const host = await getAudiusHost();
  const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=lumenjournal`;
  const res = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error("audius");
  const json = await res.json();
  return (json.data || [])
    .filter((track) => track && track.is_streamable && !track.is_stream_gated && track.title)
    .slice(0, 4)
    .map((track) => mapAudius(track, host));
}
function searchItunes(query) {
  return new Promise((resolve, reject) => {
    const cb = `lumenItunes_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("itunes-timeout"));
    }, 8000);
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }
    window[cb] = (data) => {
      cleanup();
      const tracks = (data.results || []).filter((item) => item.previewUrl).slice(0, 4).map((item) => ({
        id: `itunes:${item.trackId}`,
        title: item.trackName || "未命名",
        artist: item.artistName || "iTunes",
        artwork: item.artworkUrl100 || "",
        duration: 30,
        stream: item.previewUrl,
        source: "iTunes 试听",
      }));
      resolve(tracks);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("itunes"));
    };
    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=8&country=us&callback=${cb}`;
    document.body.appendChild(script);
  });
}
async function searchMusic(query) {
  const q = (query || "").trim() || "calm piano ambient";
  try {
    const tracks = await searchAudius(q);
    if (tracks.length) return { source: "Audius 开放曲库", tracks };
  } catch { /* try previews */ }
  const tracks = await searchItunes(q);
  if (!tracks.length) throw new Error("没有找到能播放的曲子");
  return { source: "iTunes 30 秒试听", tracks };
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}
function drawSeries(svg, days, values, box) {
  svg.replaceChildren();
  const runs = [];
  let run = [];
  days.forEach((day, index) => {
    const value = values.get(day);
    if (value == null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push({ index, day, value });
    }
  });
  if (run.length) runs.push(run);
  const yOf = (score) => box.top + (1 - (score - 1) / 9) * box.height;
  const xOf = (index) => box.left + (days.length <= 1 ? box.width / 2 : (index / (days.length - 1)) * box.width);
  for (let g = 2; g <= 10; g += 2) {
    const y = yOf(g);
    svg.append(svgEl("line", { x1: box.left, x2: box.left + box.width, y1: y, y2: y, stroke: "rgba(36,28,22,0.12)", "stroke-width": 1 }));
    const label = svgEl("text", { x: box.left - 8, y: y + 4, "text-anchor": "end", fill: "#8a7464", "font-size": 11 });
    label.textContent = String(g);
    svg.append(label);
  }
  runs.forEach((points) => {
    const line = points.map((point, i) => `${i ? "L" : "M"} ${xOf(point.index).toFixed(1)} ${yOf(point.value).toFixed(1)}`).join(" ");
    const area = `${line} L ${xOf(points[points.length - 1].index).toFixed(1)} ${(box.top + box.height).toFixed(1)} L ${xOf(points[0].index).toFixed(1)} ${(box.top + box.height).toFixed(1)} Z`;
    svg.append(svgEl("path", { d: area, fill: "rgba(31,74,64,0.12)" }));
    svg.append(svgEl("path", { d: line, fill: "none", stroke: "#1f4a40", "stroke-width": box.stroke, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  });
  return { xOf, yOf, runs: runs.flat() };
}

function paintKey() {
  const button = $("open-key");
  if (hasKey()) {
    button.textContent = "钥匙已在";
    button.classList.add("ready");
  } else {
    button.textContent = "放入钥匙";
    button.classList.remove("ready");
  }
}
function paintNav() {
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (link.dataset.route === state.route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  $("view-write").hidden = state.route !== "write";
  $("view-curve").hidden = state.route !== "curve";
  $("view-talk").hidden = state.route !== "talk";
}
function paintDate() {
  const date = parseDay(draft.date || todayStr());
  $("date-year").textContent = String(date.getFullYear());
  $("date-num").textContent = String(date.getDate());
  $("date-week").textContent = `${date.getMonth() + 1}月 · 星期${WEEK[date.getDay()]}`;
  $("day-line").textContent = dayLine();
}
function paintMood() {
  document.querySelectorAll(".stamp").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.emotion === draft.emotion ? "true" : "false");
  });
  const slider = $("mood-slider");
  slider.value = String(draft.moodScore);
  slider.setAttribute("aria-valuenow", String(draft.moodScore));
  $("mood-value").textContent = String(draft.moodScore);
  $("mood-need").hidden = Boolean(draft.emotion);
}
function paintCrisis(node, text) {
  if (!isCrisis(text)) {
    node.hidden = true;
    node.replaceChildren();
    return;
  }
  node.hidden = false;
  node.replaceChildren();
  const p = document.createElement("p");
  p.textContent = `如果你正处在很难撑住的时刻，请先联系真人。${HOTLINES}`;
  node.append(p);
}
function paintResult() {
  const ready = Boolean(draft.diary || draft.analysis || (draft.tracks && draft.tracks.length) || draft.id);
  const show = Boolean(draft.diary || draft.analysis || (draft.tracks && draft.tracks.length));
  $("result").hidden = !show;
  $("diary-title").textContent = draft.title || "未题";
  $("analysis").textContent = draft.analysis || "先写成日记，这里会写下可能的触发和一点读法。";
  const triggers = $("triggers");
  triggers.replaceChildren();
  (draft.triggers || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    triggers.append(li);
  });
  $("meditation").textContent = draft.meditation || "写成日记之后，这里会有一个一分钟的练习。";
  $("movement").textContent = draft.movement || "也会有一个很小的走动建议。";
  $("music-reason").textContent = draft.musicReason || "按你点的心情配一段声音。";
  const hint = $("ai-hint");
  if (draft.aiScore && Math.abs(draft.aiScore - draft.moodScore) >= 2) {
    hint.hidden = false;
    hint.replaceChildren();
    hint.append(`读下来，灯火更接近 ${draft.aiScore}。`);
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.className = "text-btn";
    adopt.textContent = "就按这个记";
    adopt.addEventListener("click", () => {
      draft.moodScore = draft.aiScore;
      if (draft.aiEmotion) draft.emotion = draft.aiEmotion;
      commitDraft();
      paintMood();
      paintResult();
      paintSpark();
    });
    hint.append(adopt);
  } else {
    hint.hidden = true;
  }
  paintTracks();
  const meta = $("entry-meta");
  meta.textContent = draft.id ? `${draft.date} · ${draft.emotion} · 灯火 ${draft.moodScore}` : "";
  $("btn-delete").hidden = !draft.id;
  $("btn-talk").hidden = !draft.id;
  if (!ready) $("result").hidden = !show;
}
function paintTracks() {
  const list = $("tracks");
  list.replaceChildren();
  const status = $("music-status");
  status.textContent = draft.musicSource ? `来源：${draft.musicSource}` : "";
  $("btn-reshuffle").hidden = !(draft.musicQuery || draft.emotion);
  (draft.tracks || []).forEach((track) => {
    const li = document.createElement("li");
    li.className = "track";
    if (track.artwork) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = track.artwork;
      img.addEventListener("error", () => img.replaceWith(Object.assign(document.createElement("div"), { className: "ph" })));
      li.append(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "ph";
      li.append(ph);
    }
    const text = document.createElement("div");
    const who = document.createElement("p");
    who.className = "who";
    who.textContent = track.title;
    const meta = document.createElement("p");
    meta.className = "meta";
    const mins = Math.floor((track.duration || 0) / 60);
    const secs = String((track.duration || 0) % 60).padStart(2, "0");
    meta.textContent = `${track.artist} · ${track.duration ? `${mins}:${secs}` : track.source}`;
    text.append(who, meta);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn tiny";
    const playing = state.audioId === track.id && !$("player").paused;
    button.textContent = playing ? "暂停" : "播放";
    button.setAttribute("aria-pressed", playing ? "true" : "false");
    button.addEventListener("click", () => toggleTrack(track));
    li.append(text, button);
    list.append(li);
  });
}
function paintSpark() {
  const days = lastNDays(7);
  const values = moodByDay(db.entries);
  const svg = $("spark");
  const drawn = drawSeries(svg, days, values, { left: 28, top: 8, width: 220, height: 48, stroke: 2 });
  drawn.runs.forEach((point) => {
    svg.append(svgEl("circle", {
      cx: drawn.xOf(point.index),
      cy: drawn.yOf(point.value),
      r: 3.5,
      fill: scoreColor(point.value),
    }));
  });
  const noted = days.filter((day) => values.has(day));
  if (!noted.length) {
    $("spark-note").textContent = "近七日还没有记录。";
    return;
  }
  const avg = noted.reduce((sum, day) => sum + values.get(day), 0) / noted.length;
  $("spark-note").textContent = `近七日平均灯火 ${avg.toFixed(1)}，记了 ${noted.length} 天。`;
}
function paintChart() {
  const days = lastNDays(30);
  const values = moodByDay(db.entries);
  const svg = $("chart");
  const drawn = drawSeries(svg, days, values, { left: 46, top: 16, width: 790, height: 250, stroke: 2.4 });
  const noted = days.filter((day) => values.has(day));
  $("chart-empty").hidden = noted.length > 0;
  days.forEach((day, index) => {
    if (index % 5 !== 0 && index !== days.length - 1) return;
    const label = svgEl("text", {
      x: drawn.xOf(index),
      y: 300,
      "text-anchor": "middle",
      fill: "#8a7464",
      "font-size": 12,
    });
    label.textContent = `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;
    svg.append(label);
  });
  drawn.runs.forEach((point) => {
    const dot = svgEl("circle", {
      cx: drawn.xOf(point.index),
      cy: drawn.yOf(point.value),
      r: 5,
      fill: scoreColor(point.value),
      tabindex: 0,
    });
    const title = svgEl("title");
    title.textContent = `${point.day} 灯火 ${point.value}`;
    dot.append(title);
    const show = (event) => showTip(event, point);
    dot.addEventListener("mouseenter", show);
    dot.addEventListener("focus", show);
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("blur", hideTip);
    svg.append(dot);
  });
  const all = [...values.values()];
  if (!all.length) {
    $("chart-summary").textContent = "还没有亮度。写下一句，曲线从今天开始。";
  } else {
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    $("chart-summary").textContent = `一共记了 ${db.entries.length} 张纸，有记录的日子平均灯火 ${avg.toFixed(1)}。缺的日子不连线。`;
  }
  const history = $("history");
  history.replaceChildren();
  [...db.entries].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).forEach((entry) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = entry.date;
    const score = document.createElement("span");
    score.className = "score";
    score.textContent = `${entry.emotion || "未标"} ${entry.moodScore}`;
    const snip = document.createElement("span");
    snip.className = "snip";
    snip.textContent = entry.title || entry.brief || entry.diary || "空白";
    button.append(when, score, snip);
    button.addEventListener("click", () => openEntry(entry.id));
    li.append(button);
    history.append(li);
  });
}
function showTip(event, point) {
  const tip = $("tooltip");
  const box = $("chart").getBoundingClientRect();
  const target = event.currentTarget.getBoundingClientRect();
  tip.hidden = false;
  tip.textContent = `${point.day.slice(5)} 灯火 ${point.value}`;
  tip.style.left = `${target.left - box.left + target.width / 2}px`;
  tip.style.top = `${target.top - box.top}px`;
}
function hideTip() {
  $("tooltip").hidden = true;
}
function fillText() {
  const brief = $("brief");
  const diary = $("diary-body");
  if (document.activeElement !== brief) brief.value = draft.brief || "";
  if (document.activeElement !== diary) diary.value = draft.diary || "";
}
function paintWrite() {
  paintDate();
  paintMood();
  fillText();
  paintCrisis($("crisis-write"), `${draft.brief}\n${draft.diary}`);
  paintResult();
  paintSpark();
  syncButtons();
}
function paintTalk() {
  const entry = draft && draft.id ? draft : latestEntry();
  if (entry && entry.id !== draft?.id) draft = entry;
  const title = $("talk-title");
  const excerpt = $("talk-excerpt");
  const mood = $("talk-mood");
  if (!draft || !draft.id) {
    title.textContent = "还没有纸页";
    excerpt.textContent = "先去写下一句。我读过今天的纸，才知道从哪里接。";
    mood.textContent = "";
  } else {
    title.textContent = draft.title || draft.emotion || "这张纸";
    excerpt.textContent = (draft.diary || draft.brief || "").slice(0, 280);
    mood.textContent = `${draft.date} · ${draft.emotion || "未标"} · 灯火 ${draft.moodScore}`;
  }
  paintCrisis($("crisis-talk"), `${draft?.brief || ""}\n${draft?.diary || ""}\n${(draft?.messages || []).map((m) => m.content).join("\n")}`);
  const log = $("talk-log");
  log.replaceChildren();
  const messages = draft?.messages || [];
  if (!messages.length) {
    const note = document.createElement("div");
    note.className = "bubble note";
    note.textContent = draft?.id ? "我读过这张纸。想从哪里说起？" : "写下一句之后，谈话才会开始。";
    log.append(note);
  }
  messages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${message.role === "user" ? "user" : "assistant"}`;
    bubble.textContent = message.content;
    log.append(bubble);
  });
  log.scrollTop = log.scrollHeight;
  const chips = $("chips");
  chips.replaceChildren();
  if (draft?.id) {
    ["帮我看看是什么把情绪带起来的", "我现在有点撑，给我一个很小的做法", "陪我把今天这件事说完"].forEach((text) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = text;
      chip.addEventListener("click", () => sendTalk(text));
      chips.append(chip);
    });
  }
  $("talk-form").hidden = !draft?.id;
  syncButtons();
}
function syncButtons() {
  const busy = Boolean(state.busy);
  $("btn-generate").disabled = busy;
  $("btn-save").disabled = busy;
  $("btn-generate").textContent = state.busy === "diary" ? "正在铺开…" : "帮我写成日记";
  $("btn-save").textContent = state.busy === "music" ? "正在找曲子…" : "先存下来";
  $("talk-send").disabled = busy;
  $("talk-stop").hidden = state.busy !== "talk";
}
function show(route) {
  if ((draft?.brief || "").trim() || (draft?.diary || "").trim()) {
    if (draft.emotion) commitDraft();
  }
  state.route = route;
  history.replaceState(null, "", `#${route}`);
  paintNav();
  if (route === "write") paintWrite();
  if (route === "curve") paintChart();
  if (route === "talk") paintTalk();
}

function commitDraft() {
  if (!draft.emotion) draft.emotion = emotionFromScore(draft.moodScore);
  if (!draft.id) {
    draft.id = crypto.randomUUID();
    draft.createdAt = new Date().toISOString();
    draft.date = draft.date || todayStr();
    db.entries.push(draft);
  }
  draft.updatedAt = new Date().toISOString();
  saveDb();
}
function openEntry(id) {
  const found = db.entries.find((entry) => entry.id === id);
  if (!found) return;
  draft = found;
  location.hash = "write";
}
function requireMood() {
  if (draft.emotion) return true;
  $("mood-need").hidden = false;
  $("stamps").scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
}
function openKey() {
  $("api-key").value = db.settings.apiKey || "";
  $("api-model").value = db.settings.model || "deepseek-flash";
  $("api-base").value = db.settings.baseUrl || "https://api.deepseek.com";
  $("key-msg").textContent = "";
  $("key-dialog").showModal();
}
function friendlyError(error) {
  if (error?.code === "NO_KEY" || error?.message === "NO_KEY") return "先放入 DeepSeek 钥匙。";
  if (error?.name === "AbortError") return "";
  if (error?.name === "TypeError") return "没有连上接口。请用网页地址打开，而不是直接打开文件。";
  return error?.message || "这次没有完成。";
}

async function attachMusic(query, reason) {
  state.busy = "music";
  syncButtons();
  $("music-status").textContent = "正在找能听的曲子…";
  try {
    const found = await searchMusic(query);
    draft.musicQuery = query;
    draft.musicSource = found.source;
    draft.tracks = found.tracks;
    if (reason) draft.musicReason = reason;
    if (draft.id) saveDb();
    paintResult();
  } catch {
    draft.tracks = [];
    draft.musicSource = "";
    $("music-status").textContent = "这会儿没有取到曲子，可以换一批。";
    $("btn-reshuffle").hidden = false;
    toast("音乐接口暂时没有回应。");
  } finally {
    state.busy = false;
    syncButtons();
  }
}
async function saveOnly() {
  draft.brief = $("brief").value;
  if (!(draft.brief || "").trim() && !(draft.diary || "").trim()) {
    toast("先写一句，再存。");
    return;
  }
  if (!requireMood()) return;
  if (!draft.diary) draft.diary = draft.brief.trim();
  if (!draft.musicReason) draft.musicReason = `按你标的「${draft.emotion}」，先放一段更安静的声音。`;
  commitDraft();
  paintWrite();
  toast("已经留在这台浏览器里。");
  const query = draft.musicQuery || MUSIC_FALLBACK[draft.emotion] || "calm piano";
  if (!draft.tracks || !draft.tracks.length) await attachMusic(query, draft.musicReason);
}
async function generate() {
  draft.brief = $("brief").value.trim();
  if (draft.brief.length < 2) {
    toast("再多写几个字。一句也行。");
    return;
  }
  if (!requireMood()) return;
  if (!hasKey()) {
    openKey();
    return;
  }
  commitDraft();
  state.busy = "diary";
  syncButtons();
  try {
    const content = await complete({
      temperature: 0.8,
      json: true,
      maxTokens: 1800,
      messages: [
        { role: "system", content: DIARY_SYSTEM },
        { role: "user", content: `日期：${draft.date}\n用户选的心情：${draft.emotion}\n用户标的灯火（1到10，10最亮）：${draft.moodScore}\n用户的原话：\n${draft.brief}` },
      ],
    });
    const raw = parseJson(content);
    const emotion = MOODS.some((mood) => mood.label === raw.emotion) ? raw.emotion : draft.emotion;
    draft.title = String(raw.title || "").replace(/\s+/g, "").slice(0, 24);
    draft.diary = String(raw.diary || "").trim();
    draft.aiEmotion = emotion;
    draft.aiScore = clamp(Math.round(Number(raw.moodScore)), 1, 10);
    draft.triggers = Array.isArray(raw.triggers) ? raw.triggers.map((item) => String(item).slice(0, 16)).filter(Boolean).slice(0, 3) : [];
    draft.analysis = String(raw.analysis || "").trim();
    draft.meditation = String(raw.meditation || "").trim();
    draft.movement = String(raw.movement || "").trim();
    draft.musicQuery = String(raw.musicQuery || MUSIC_FALLBACK[draft.emotion] || "calm piano").slice(0, 80);
    draft.musicReason = String(raw.musicReason || "").trim();
    if (!draft.diary) throw new Error("模型没有写成日记，可以再试一次。");
    commitDraft();
    fillText();
    paintWrite();
    await attachMusic(draft.musicQuery, draft.musicReason);
  } catch (error) {
    const msg = friendlyError(error);
    if (msg) toast(msg);
    state.busy = false;
    syncButtons();
    paintWrite();
  }
}

function talkSystem(entry) {
  return `你是「灯下手记」里的倾听者。你不是医生，不做诊断，不开药，不替代咨询。
你已经读过用户这张纸。说话短，像一个稳的朋友：先接住情绪，再给一个很小的下一步。每次 80 到 180 个汉字，除非用户明确要求一个练习。
不要说“作为人工智能”。不要用表情符号。不要连环追问。
如果出现自伤、自杀或不想活：认真对待，告诉对方此刻很重要，请马上联系身边的人或专业热线（全国心理援助热线 12356，北京心理危机研究与干预中心 010-82951332，生命热线 400-821-1215）。不要讨论任何具体方法，不要评价对错。

这张纸：
日期：${entry.date}
心情：${entry.emotion || "未标"}，灯火 ${entry.moodScore}/10
原话：${entry.brief || "（无）"}
日记：${entry.diary || "（还没有写成篇）"}
触发：${(entry.triggers || []).join("、") || "（还没有）"}
先前的解读：${entry.analysis || "（无）"}`;
}
async function sendTalk(text) {
  const content = (text || "").trim();
  if (!content || state.busy) return;
  if (!draft?.id) {
    toast("先留下一张纸。");
    return;
  }
  if (!hasKey()) {
    openKey();
    return;
  }
  draft.messages = draft.messages || [];
  draft.messages.push({ role: "user", content, at: new Date().toISOString() });
  $("talk-input").value = "";
  paintTalk();
  paintCrisis($("crisis-talk"), content);
  const history = draft.messages.slice(-8).map((message) => ({ role: message.role, content: message.content }));
  state.busy = "talk";
  syncButtons();
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant";
  bubble.textContent = "灯还亮着…";
  $("talk-log").append(bubble);
  const controller = new AbortController();
  state.talkAbort = controller;
  try {
    const reply = await streamChat({
      signal: controller.signal,
      messages: [{ role: "system", content: talkSystem(draft) }, ...history],
      onDelta: (full) => {
        bubble.textContent = full;
        $("talk-log").scrollTop = $("talk-log").scrollHeight;
      },
    });
    const finalText = reply || "我在。你愿意再讲一句现在身体的感觉吗？";
    bubble.textContent = finalText;
    draft.messages.push({ role: "assistant", content: finalText, at: new Date().toISOString() });
    saveDb();
  } catch (error) {
    bubble.remove();
    const msg = friendlyError(error);
    if (msg) {
      const note = document.createElement("div");
      note.className = "bubble note";
      note.textContent = msg;
      $("talk-log").append(note);
    }
    if (error?.name === "AbortError") {
      const partial = bubble.textContent;
      if (partial && partial !== "灯还亮着…") {
        draft.messages.push({ role: "assistant", content: partial, at: new Date().toISOString() });
        saveDb();
      }
    }
  } finally {
    state.busy = false;
    state.talkAbort = null;
    syncButtons();
    paintCrisis($("crisis-talk"), `${draft.brief}\n${draft.diary}\n${draft.messages.map((m) => m.content).join("\n")}`);
  }
}

function toggleTrack(track) {
  const player = $("player");
  if (state.audioId === track.id && !player.paused) {
    player.pause();
    state.audioId = null;
    paintTracks();
    return;
  }
  player.src = track.stream;
  state.audioId = track.id;
  player.play().catch(() => {
    toast("这首暂时播不了，换一首试试。");
    state.audioId = null;
  });
  paintTracks();
}
function stopBreath() {
  if (state.breath) clearTimeout(state.breath);
  state.breath = null;
  $("breath-orb").classList.remove("inhale", "exhale");
  $("breath-label").textContent = "准备好了再开始";
  $("btn-breath").textContent = "开始一分钟";
}
function startBreath() {
  if (state.breath) {
    stopBreath();
    return;
  }
  let left = 6;
  const step = (phase) => {
    const orb = $("breath-orb");
    orb.classList.remove("inhale", "exhale");
    void orb.offsetWidth;
    if (phase === "in") {
      orb.classList.add("inhale");
      $("breath-label").textContent = `吸气 · 还剩 ${left} 轮`;
      state.breath = setTimeout(() => step("out"), 4000);
    } else {
      orb.classList.add("exhale");
      $("breath-label").textContent = "呼气，放慢一点";
      left -= 1;
      state.breath = setTimeout(() => {
        if (left <= 0) stopBreath();
        else step("in");
      }, 6000);
    }
  };
  $("btn-breath").textContent = "停下";
  step("in");
}

const DIARY_SYSTEM = `你是「灯下手记」的书写助手。用户只给一句很短的话，你把它写成一篇第一人称日记，并给出温和、具体、现在就能做的自我关怀建议。

规则：
- 只依据用户给出的事实来写。可以补充合理的身体感觉和情绪纹理，但不要编造用户没提到的人物、地点、事件、诊断或过去。
- 如果用户已经写得比较完整，就整理润色，不要注水。
- 尽量保留用户的原词。
- 日记使用中文，180到320个汉字，像写给自己，口语，不要鸡汤，不要称呼“亲爱的”，不要用表情符号。
- 分析用“也许”“像是”，指出可能的触发，不要下诊断，不要说“你患有”。
- 冥想是一个此刻就能做的约一分钟练习，具体到呼吸或身体，60到110个汉字。
- 运动是一个不超过10分钟、在房间里也能做的小活动，40到90个汉字。
- musicQuery 用英文，3到6个词，描述氛围和乐器，适合搜索轻音乐或纯音乐。不要指定某一首受版权保护的流行歌。
- 若文本流露自伤、自杀或不想活下去：不要描述任何方法；diary 只温和承接情绪；analysis 明确建议立刻联系身边的人或心理热线；meditation 只用脚踩地、看周围物体这类接地练习。
- 只输出一个 JSON 对象，不要 Markdown。

字段：
{"title":"不超过12个字","diary":"...","emotion":"欢喜|安稳|期待|疲惫|焦虑|低落|烦闷","moodScore":1到10的整数,"triggers":["最多3个，每个不超过12字"],"analysis":"80到140字","meditation":"...","movement":"...","musicQuery":"english","musicReason":"一句中文，为什么这种声音适合现在"}`;

function bind() {
  const stamps = $("stamps");
  MOODS.forEach((mood) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stamp";
    button.dataset.emotion = mood.label;
    button.textContent = mood.label;
    button.addEventListener("click", () => {
      draft.emotion = mood.label;
      draft.moodScore = mood.score;
      paintMood();
    });
    stamps.append(button);
  });
  $("mood-slider").addEventListener("input", (event) => {
    draft.moodScore = Number(event.target.value);
    if (!draft.emotion) draft.emotion = emotionFromScore(draft.moodScore);
    paintMood();
  });
  $("brief").addEventListener("input", (event) => {
    draft.brief = event.target.value;
    paintCrisis($("crisis-write"), `${draft.brief}\n${draft.diary || ""}`);
    queueSave();
  });
  $("diary-body").addEventListener("input", (event) => {
    draft.diary = event.target.value;
    paintCrisis($("crisis-write"), `${draft.brief}\n${draft.diary}`);
    queueSave();
  });
  $("btn-save").addEventListener("click", () => saveOnly());
  $("btn-generate").addEventListener("click", () => generate());
  $("brief").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generate();
  });
  $("btn-new").addEventListener("click", () => {
    if (draft?.id) commitDraft();
    draft = blankDraft();
    stopBreath();
    paintWrite();
  });
  $("btn-delete").addEventListener("click", () => {
    if (!draft?.id) return;
    if (!confirm("这张纸会从这台浏览器里删掉，不能恢复。")) return;
    db.entries = db.entries.filter((entry) => entry.id !== draft.id);
    saveDb();
    draft = todayLatest() || blankDraft();
    paintWrite();
    toast("已经删掉。");
  });
  $("btn-talk").addEventListener("click", () => {
    if (draft?.id) location.hash = "talk";
  });
  $("btn-reshuffle").addEventListener("click", () => {
    const query = MUSIC_FALLBACK[draft.emotion] || draft.musicQuery || "soft piano";
    attachMusic(query, draft.musicReason);
  });
  $("btn-breath").addEventListener("click", startBreath);
  $("open-key").addEventListener("click", openKey);
  $("close-key").addEventListener("click", () => $("key-dialog").close());
  $("key-dialog").addEventListener("click", (event) => {
    if (event.target === $("key-dialog")) $("key-dialog").close();
  });
  $("key-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      db.settings.baseUrl = new URL($("api-base").value).origin;
    } catch {
      $("key-msg").textContent = "接口地址不像一个网址。";
      return;
    }
    db.settings.apiKey = $("api-key").value.trim();
    db.settings.model = $("api-model").value;
    saveDb();
    paintKey();
    $("key-dialog").close();
    toast(hasKey() ? "钥匙已留在这台浏览器。" : "钥匙是空的，AI 还不能用。");
  });
  $("clear-key").addEventListener("click", () => {
    db.settings.apiKey = "";
    saveDb();
    $("api-key").value = "";
    paintKey();
    $("key-msg").textContent = "已经清除。";
  });
  $("test-key").addEventListener("click", async () => {
    const previous = db.settings.apiKey;
    db.settings.apiKey = $("api-key").value.trim();
    db.settings.model = $("api-model").value;
    try { db.settings.baseUrl = new URL($("api-base").value).origin; } catch {
      $("key-msg").textContent = "接口地址不像一个网址。";
      db.settings.apiKey = previous;
      return;
    }
    $("key-msg").textContent = "正在试这把钥匙…";
    try {
      const reply = await complete({
        temperature: 0,
        json: false,
        maxTokens: 16,
        messages: [
          { role: "system", content: "只回复两个汉字：好的" },
          { role: "user", content: "在吗" },
        ],
      });
      $("key-msg").textContent = reply.trim() ? "钥匙可用。" : "有回应，但内容是空的。";
      saveDb();
      paintKey();
    } catch (error) {
      $("key-msg").textContent = friendlyError(error);
      db.settings.apiKey = previous;
    }
  });
  $("talk-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendTalk($("talk-input").value);
  });
  $("talk-stop").addEventListener("click", () => state.talkAbort?.abort());
  $("talk-clear").addEventListener("click", () => {
    if (!draft?.messages?.length) return;
    if (!confirm("清空这场谈话？日记还在。")) return;
    draft.messages = [];
    saveDb();
    paintTalk();
  });
  $("player").addEventListener("ended", () => {
    state.audioId = null;
    paintTracks();
  });
  $("player").addEventListener("error", () => {
    if (!state.audioId) return;
    state.audioId = null;
    paintTracks();
    toast("这首播不了，换一首试试。");
  });
  window.addEventListener("hashchange", () => {
    const route = (location.hash || "#write").slice(1);
    show(route === "curve" || route === "talk" ? route : "write");
  });
}
function queueSave() {
  if (!draft?.id) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    draft.updatedAt = new Date().toISOString();
    saveDb();
  }, 400);
}

function init() {
  draft = todayLatest() || latestEntry() || blankDraft();
  if (draft.date !== todayStr() && latestEntry() === draft) {
    const today = todayLatest();
    draft = today || blankDraft();
  }
  bind();
  paintKey();
  const route = (location.hash || "#write").slice(1);
  show(route === "curve" || route === "talk" ? route : "write");
}

init();
