const KEY = "lumen-journal-v1";
const MOODS = [
  { label: "开心", score: 8 },
  { label: "平静", score: 7 },
  { label: "期待", score: 7 },
  { label: "累", score: 4 },
  { label: "焦虑", score: 3 },
  { label: "低落", score: 2 },
  { label: "心烦", score: 3 },
];
const LINES = [
  "写一句就行，不用把今天写完。",
  "累的话，三个字也算数。",
  "先写身体哪里不舒服。",
  "不用写好看，写真的就行。",
  "心情会变，先记下来。",
  "今晚不用写完整。",
  "不想写也可以停。",
];
const MUSIC_FALLBACK = {
  开心: "bright acoustic guitar instrumental",
  平静: "soft piano ambient",
  期待: "hopeful acoustic instrumental",
  累: "slow night jazz instrumental",
  焦虑: "calm piano instrumental",
  低落: "gentle strings ambient",
  心烦: "warm acoustic instrumental",
};
const VIDEO_KEYWORD = {
  开心: "心情好的时候看什么",
  平静: "冥想入门",
  期待: "对未来不安怎么办",
  累: "累了怎么休息",
  焦虑: "怎么缓解焦虑",
  低落: "心情低落怎么办",
  心烦: "心烦怎么办",
};
const VIDEO_PRESETS = {
  焦虑: [
    ["BV17DHwzkEEe", "学习过程中容易产生焦虑情绪，怎么缓解焦虑？"],
    ["BV1yYGhz5Emu", "倪海厦：焦虑的根源与治症"],
    ["BV1fLYJ6zEUT", "停止灾难性思维，缓解焦虑内耗"],
  ],
  低落: [
    ["BV1rumfYZEX7", "当你的心情低落时，你应该这样做"],
    ["BV1Kaeh6HEZ2", "感觉没有希望了，想放弃？就看看这条视频。"],
    ["BV1vo8QzcENd", "为什么你总是不开心？习惯性悲观怎么办"],
  ],
  心烦: [
    ["BV1Fd4y1572B", "抑郁烦躁、心慌怎么办？这几个地方按一按，可缓解！"],
    ["BV1hG4y1i7QT", "心烦心慌，生闷气？中医教您简单一招"],
    ["BV1Lt4y1G7mG", "心烦意乱的时候，如何快速调整自己？"],
  ],
  累: [
    ["BV1yph76uESz", "累了可以休息，但不要忘了脚下的路"],
    ["BV1TY4y1676v", "休息术冥想：休息十分钟，等于深度睡眠三小时"],
    ["BV1bk4y1w74k", "考研九月疲惫期，很多人学不动了进来听听"],
  ],
  平静: [
    ["BV1NM4y1d7aC", "21天系统学习冥想，科学入门正念"],
    ["BV1Yt4y1C7zM", "零基础冥想入门，十天引导式冥想"],
    ["BV1jfhj6dEQA", "新手打坐冥想入门教学"],
  ],
  期待: [
    ["BV1gU4y1579n", "如何停止对未来的恐惧"],
    ["BV1seba63ETV", "停止预测未来：你正在经历的可能是预期性焦虑"],
    ["BV11zmoY8EqL", "对于未发生的事过度焦虑，怎么应对"],
  ],
  开心: [
    ["BV1dc411y7KC", "心情不好？看这个视频就够了。"],
    ["BV1Ukha6QEUE", "有时候发泄一下心情会变好"],
    ["BV16i421R7GN", "当你不开心的时候，就看看这些话"],
  ],
};
const CRISIS_RE = /自杀|不想活|活不下去|结束生命|轻生|自残|割腕|去死|伤害自己|不想活着/;
const HOTLINES = "全国心理援助热线 12356，北京心理危机研究与干预中心 010-82951332，生命热线 400-821-1215。要是已经有危险，打当地急救电话。";

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
    toast("这浏览器存满了，可能记不住。");
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
    videoKeyword: "",
    videoReason: "",
    video: null,
    videos: [],
    followups: [],
    pendingQuestion: "",
    followDone: false,
    talkStarted: false,
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
function scoreColor(score, night) {
  if (night) {
    if (score <= 3) return "#e7a598";
    if (score <= 6) return "#f0b45a";
    return "#d5efe4";
  }
  if (score <= 3) return "#8c3a32";
  if (score <= 6) return "#a56b32";
  return "#1f4a40";
}
function emotionFromScore(score) {
  if (score >= 8) return "开心";
  if (score >= 6) return "平静";
  if (score >= 4) return "累";
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
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("地址得用 http 或 https 开头");
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
  if (status === 401) return "密钥不对，看看是不是没复制全。";
  if (status === 402) return "余额不够了，得先充值。";
  if (status === 429) return "问太勤了，等一下再试。";
  if (status === 400) return msg ? `没发出去：${msg.slice(0, 180)}` : "没发出去。";
  return msg ? `那边没响应（${status}）：${msg.slice(0, 180)}` : `那边没响应（${status}）。`;
}
function parseJson(text) {
  const trimmed = String(text || "").trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("这次没写出来，再试一次。");
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
    signal: signal || AbortSignal.timeout(30000),
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
  if (!content.trim()) throw new Error("这次是空的，再试一次。");
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
        source: "iTunes，只能听 30 秒",
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
  const cleaned = String(query || "").replace(/\bno\b|vocals?|lyrics?/gi, " ").replace(/\s+/g, " ").trim();
  const attempts = [query, cleaned, "calm piano instrumental"].map((item) => String(item || "").trim()).filter(Boolean);
  const tried = new Set();
  for (const term of attempts) {
    if (tried.has(term)) continue;
    tried.add(term);
    try {
      const tracks = await searchAudius(term);
      if (tracks.length) return { source: "Audius", tracks };
    } catch { /* try the next phrase */ }
  }
  const tracks = await searchItunes(attempts[0] || "calm piano instrumental");
  if (!tracks.length) throw new Error("没找到能放的歌");
  return { source: "iTunes，只能听 30 秒", tracks };
}
function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
function absUrl(url) {
  if (!url) return "";
  if (String(url).startsWith("//")) return `https:${url}`;
  return url;
}
function videoKeywordFor(entry) {
  const text = `${entry?.brief || ""}\n${entry?.diary || ""}`;
  if (isCrisis(text)) return "心情崩溃怎么办";
  const custom = String(entry?.videoKeyword || "").trim();
  if (custom) return custom.slice(0, 24);
  return VIDEO_KEYWORD[entry?.emotion] || "心情不好怎么办";
}
function videoSearchUrl(keyword) {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
}
function firstBiliVideo(json) {
  if (!json || json.code !== 0) return null;
  const result = json.data?.result;
  if (!Array.isArray(result)) return null;
  let items = result;
  if (result[0] && Array.isArray(result[0].data)) {
    const group = result.find((item) => item.result_type === "video") || result.find((item) => Array.isArray(item.data));
    items = group?.data || [];
  }
  const hit = items.find((item) => item && (item.bvid || item.bvid === 0 || item.aid));
  if (!hit || !hit.bvid) return null;
  const bvid = String(hit.bvid);
  return {
    bvid,
    title: stripHtml(hit.title) || "B 站上的视频",
    author: hit.author || "",
    cover: absUrl(hit.pic || ""),
    pageUrl: absUrl(hit.arcurl) || `https://www.bilibili.com/video/${bvid}`,
  };
}
function matchPreset(entry) {
  const text = `${entry?.videoKeyword || ""} ${entry?.emotion || ""}`;
  if (/低落|不开心|没希望|难过/.test(text)) return "低落";
  if (/心烦|烦躁|生气|闷/.test(text)) return "心烦";
  if (/累|疲惫|休息|困/.test(text)) return "累";
  if (/冥想|平静|放松/.test(text)) return "平静";
  if (/未来|不安|迷茫|期待/.test(text)) return "期待";
  if (/开心|高兴|愉快/.test(text)) return "开心";
  if (VIDEO_PRESETS[entry?.emotion]) return entry.emotion;
  return "焦虑";
}
function presetVideos(emotion) {
  const rows = VIDEO_PRESETS[emotion] || VIDEO_PRESETS["焦虑"];
  return rows.map(([bvid, title]) => ({
    bvid,
    title,
    author: "",
    cover: "",
    pageUrl: `https://www.bilibili.com/video/${bvid}`,
  }));
}
function videosFromSearch(json) {
  if (!json || json.code !== 0 || !Array.isArray(json.data?.result)) return [];
  const skip = /炉石|小鸡|Apple Watch|金拍谢|安妮单人|游戏崩溃/;
  const list = json.data.result.filter((item) => item && item.bvid && !skip.test(stripHtml(item.title)));
  const picked = (list.length ? list : json.data.result.filter((item) => item && item.bvid)).slice(0, 3);
  return picked.map((item) => {
    const bvid = String(item.bvid);
    return {
      bvid,
      title: stripHtml(item.title) || "B 站视频",
      author: item.author || "",
      cover: absUrl(item.pic || ""),
      pageUrl: `https://www.bilibili.com/video/${bvid}`,
    };
  });
}
async function searchBilibili(keyword) {
  const encoded = encodeURIComponent(keyword);
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encoded}&order=totalrank&page=1`;
  try {
    const res = await fetch(url, { referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const videos = videosFromSearch(await res.json());
    if (videos.length) return videos;
  } catch { /* 用事先搜好的三条 */ }
  return [];
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
  if (!box.bare) {
    for (let g = 2; g <= 10; g += 2) {
      const y = yOf(g);
      svg.append(svgEl("line", { x1: box.left, x2: box.left + box.width, y1: y, y2: y, stroke: box.grid || "rgba(36,28,22,0.12)", "stroke-width": 1 }));
      const label = svgEl("text", { x: box.left - 8, y: y + 4, "text-anchor": "end", fill: box.label || "#8a7464", "font-size": 11 });
      label.textContent = String(g);
      svg.append(label);
    }
  }
  const ink = box.ink || "#1f4a40";
  const areaFill = box.area || "rgba(31,74,64,0.12)";
  runs.forEach((points) => {
    const line = points.map((point, i) => `${i ? "L" : "M"} ${xOf(point.index).toFixed(1)} ${yOf(point.value).toFixed(1)}`).join(" ");
    const floor = box.top + box.height;
    const area = `${line} L ${xOf(points[points.length - 1].index).toFixed(1)} ${floor.toFixed(1)} L ${xOf(points[0].index).toFixed(1)} ${floor.toFixed(1)} Z`;
    svg.append(svgEl("path", { d: area, fill: areaFill }));
    svg.append(svgEl("path", { d: line, fill: "none", stroke: ink, "stroke-width": box.stroke, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  });
  return { xOf, yOf, runs: runs.flat() };
}

function paintKey() {
  const button = $("open-key");
  if (hasKey()) {
    button.textContent = "已设置";
    button.classList.add("ready");
  } else {
    button.textContent = "设置";
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
  $("date-week").textContent = `${date.getMonth() + 1}月 · 周${WEEK[date.getDay()]}`;
  $("day-line").textContent = dayLine();
  $("desk-title").textContent = (draft.date || todayStr()) === todayStr() ? "今天什么心情" : "那天什么心情";
}
function paintMood() {
  document.querySelectorAll(".stamp").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.emotion === draft.emotion ? "true" : "false");
  });
  const slider = $("mood-slider");
  slider.value = String(draft.moodScore);
  slider.setAttribute("aria-valuenow", String(draft.moodScore));
  $("mood-value").textContent = String(draft.moodScore);
  if (draft.emotion) $("mood-need").hidden = true;
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
  p.textContent = `要是你现在有点撑不住，先找个人，或者打电话。${HOTLINES}`;
  node.append(p);
}
function paintResult() {
  const sameAsBrief = (draft.diary || "").trim() === (draft.brief || "").trim();
  const expanded = Boolean(draft.analysis || draft.title || ((draft.diary || "").trim() && !sameAsBrief));
  const show = expanded || Boolean((draft.tracks && draft.tracks.length) || draft.analysis || draft.meditation || draft.movement || draft.musicReason || draft.videoKeyword || draft.videoReason);
  $("result").hidden = !show;
  $("expanded-block").hidden = !expanded;
  $("reading-block").hidden = !draft.analysis && !(draft.triggers || []).length;
  $("care-sit").hidden = !draft.meditation;
  $("care-move").hidden = !draft.movement;
  $("diary-title").textContent = draft.title || "没起标题";
  $("analysis").textContent = draft.analysis || "";
  const triggers = $("triggers");
  triggers.replaceChildren();
  (draft.triggers || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    triggers.append(li);
  });
  $("meditation").textContent = draft.meditation || "";
  $("movement").textContent = draft.movement || "";
  $("music-reason").textContent = draft.musicReason || "";
  const hint = $("ai-hint");
  if (draft.aiScore && Math.abs(draft.aiScore - draft.moodScore) >= 2) {
    hint.hidden = false;
    hint.replaceChildren();
    hint.append(`它觉得更接近 ${draft.aiScore} 分。`);
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.className = "text-btn";
    adopt.textContent = "就按这个";
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
  paintVideo();
  paintFollow();
  const meta = $("entry-meta");
  meta.textContent = draft.id ? `${draft.date} · ${draft.emotion} · ${draft.moodScore} 分` : "";
  $("btn-delete").hidden = !draft.id;
  $("btn-talk").hidden = !draft.id;
}
function paintTracks() {
  const list = $("tracks");
  list.replaceChildren();
  const status = $("music-status");
  status.textContent = draft.musicSource ? `来自 ${draft.musicSource}` : "";
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
function currentVideos() {
  if (draft.videos && draft.videos.length) return draft.videos.slice(0, 3);
  if (draft.video && draft.video.bvid) return [draft.video];
  return [];
}
function paintVideo() {
  const card = $("video-card");
  if (!card) return;
  const videos = currentVideos();
  $("video-reason").textContent = draft.videoReason || (videos.length ? `这三支是按「${videoKeywordFor(draft)}」搜到的前几条，点进去就是视频。` : "");
  $("care-video").hidden = !videos.length;
  card.replaceChildren();
  videos.forEach((video) => {
    const link = document.createElement("a");
    link.className = "video-found";
    link.href = video.pageUrl || `https://www.bilibili.com/video/${video.bvid}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (video.cover) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = video.cover;
      img.addEventListener("error", () => img.replaceWith(Object.assign(document.createElement("div"), { className: "ph" })));
      link.append(img);
    } else {
      const mark = document.createElement("span");
      mark.className = "video-mark";
      mark.textContent = "B";
      link.append(mark);
    }
    const text = document.createElement("span");
    const who = document.createElement("strong");
    who.textContent = video.title || "B 站视频";
    const meta = document.createElement("small");
    meta.textContent = link.href;
    text.append(who, meta);
    link.append(text);
    card.append(link);
  });
}
function paintSpark() {
  const days = lastNDays(7);
  const values = moodByDay(db.entries);
  const svg = $("spark");
  const drawn = drawSeries(svg, days, values, {
    left: 8,
    top: 10,
    width: 244,
    height: 48,
    stroke: 2,
    bare: true,
    ink: "#f0b45a",
    area: "rgba(240,180,90,0.2)",
  });
  drawn.runs.forEach((point) => {
    svg.append(svgEl("circle", {
      cx: drawn.xOf(point.index),
      cy: drawn.yOf(point.value),
      r: 3.5,
      fill: scoreColor(point.value, true),
    }));
  });
  const noted = days.filter((day) => values.has(day));
  if (!noted.length) {
    $("spark-note").textContent = "这七天还没记过。";
    return;
  }
  const avg = noted.reduce((sum, day) => sum + values.get(day), 0) / noted.length;
  $("spark-note").textContent = `这七天平均 ${avg.toFixed(1)} 分，记了 ${noted.length} 天。`;
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
      style: "cursor:pointer",
    });
    const title = svgEl("title");
    title.textContent = `${point.day} ${point.value} 分`;
    dot.append(title);
    const show = (event) => showTip(event, point);
    dot.addEventListener("mouseenter", show);
    dot.addEventListener("focus", show);
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("blur", hideTip);
    dot.addEventListener("click", () => {
      const entry = db.entries
        .filter((item) => item.date === point.day)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
      if (entry) openEntry(entry.id);
    });
    svg.append(dot);
  });
  const all = [...values.values()];
  if (!all.length) {
    $("chart-summary").textContent = "还没有点。写一句，这里才有线。";
  } else {
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    $("chart-summary").textContent = `记了 ${db.entries.length} 次。有记录的天平均 ${avg.toFixed(1)} 分，没记的天就不连上。`;
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
    score.textContent = `${entry.emotion || "没选"} ${entry.moodScore} 分`;
    const snip = document.createElement("span");
    snip.className = "snip";
    snip.textContent = entry.title || entry.brief || entry.diary || "没写内容";
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
  tip.textContent = `${point.day.slice(5)} ${point.value} 分`;
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
let openingTalk = false;
async function openCounselor(entry) {
  if (!entry?.id || openingTalk || entry.talkStarted) return;
  if (entry.messages && entry.messages.length) return;
  if (!hasKey()) return;
  openingTalk = true;
  entry.talkStarted = true;
  saveDb();
  if (draft === entry && state.route === "talk") paintTalk();
  state.busy = "talk";
  syncButtons();
  try {
    const reply = await complete({
      temperature: 0.7,
      json: false,
      maxTokens: 420,
      messages: [
        { role: "system", content: `${talkSystem(entry)}\n现在请你先开口。根据日记和补充，先点出一件具体的事，再问一个小问题。不要等对方先说话。80到160个字。` },
        { role: "user", content: "我写好了。" },
      ],
    });
    entry.messages = [{ role: "assistant", content: reply, at: new Date().toISOString() }];
  } catch (error) {
    entry.talkStarted = false;
    const msg = friendlyError(error);
    if (msg && draft === entry) toast(msg);
  } finally {
    openingTalk = false;
    if (state.busy === "talk") state.busy = false;
    saveDb();
    syncButtons();
    if (draft === entry && state.route === "talk") paintTalk();
  }
}
function paintTalk() {
  const entry = draft && draft.id ? draft : latestEntry();
  if (entry && entry.id !== draft?.id) draft = entry;
  const title = $("talk-title");
  const excerpt = $("talk-excerpt");
  const mood = $("talk-mood");
  if (!draft || !draft.id) {
    title.textContent = "还没写";
    excerpt.textContent = "先去写一句。我看过你写的，才知道怎么接。";
    mood.textContent = "";
  } else {
    title.textContent = draft.title || (draft.brief || "").trim().slice(0, 18) || draft.emotion || "这条";
    excerpt.textContent = (draft.diary || draft.brief || "").slice(0, 280);
    mood.textContent = `${draft.date} · ${draft.emotion || "没选"} · ${draft.moodScore} 分`;
  }
  paintCrisis($("crisis-talk"), `${draft?.brief || ""}\n${draft?.diary || ""}\n${(draft?.messages || []).map((m) => m.content).join("\n")}`);
  const log = $("talk-log");
  log.replaceChildren();
  const messages = draft?.messages || [];
  if (!messages.length) {
    const note = document.createElement("div");
    note.className = "bubble note";
    note.textContent = draft?.talkStarted ? "我看看你写的，马上跟你说。" : (draft?.id ? "我先开口。" : "先写一句，再来聊。");
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
    ["帮我看看是什么惹的", "我有点撑不住，给个现在就能做的", "陪我把今天这事说完"].forEach((text) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = text;
      chip.disabled = Boolean(state.busy);
      chip.addEventListener("click", () => sendTalk(text));
      chips.append(chip);
    });
  }
  $("talk-form").hidden = !draft?.id;
  syncButtons();
  if (state.route === "talk") openCounselor(draft);
}
function syncButtons() {
  const writing = state.busy === "diary";
  const asking = state.busy === "ask";
  const talking = state.busy === "talk";
  $("btn-generate").disabled = writing || asking;
  $("btn-save").disabled = writing;
  $("btn-generate").textContent = writing ? "正在写" : (asking ? "先问你" : "帮我写一下");
  $("btn-save").textContent = "先记下";
  $("talk-send").disabled = talking;
  $("talk-stop").hidden = !talking;
  document.querySelectorAll(".stamp, #btn-new, #btn-delete, #btn-talk, .nav a, .dock a").forEach((node) => {
    node.removeAttribute("disabled");
  });
}
function setWriting(on) {
  const sheet = document.querySelector("#view-write .sheet");
  if (sheet) sheet.classList.toggle("is-writing", on);
  $("btn-generate").classList.toggle("is-busy", on);
}
function show(route) {
  const next = route === "curve" || route === "talk" ? route : "write";
  try {
    if ($("key-dialog").open) $("key-dialog").close();
  } catch { /* ignore */ }
  try {
    if ((draft?.brief || "").trim() || (draft?.diary || "").trim()) {
      if (draft.emotion) commitDraft();
    }
  } catch { /* ignore */ }
  state.route = next;
  try { history.replaceState(null, "", `#${next}`); } catch { /* ignore */ }
  paintNav();
  try {
    if (next === "write") paintWrite();
    if (next === "curve") paintChart();
    if (next === "talk") paintTalk();
  } catch (error) {
    console.error(error);
    toast("这一页没打开，再点一次。");
  }
  window.scrollTo(0, 0);
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
  toast("先在左边点一个心情，比如焦虑。");
  $("stamps").scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
}
function openKey() {
  $("api-key").value = db.settings.apiKey || "";
  $("api-model").value = db.settings.model || "deepseek-flash";
  $("api-base").value = db.settings.baseUrl || "https://api.deepseek.com";
  $("key-msg").textContent = "";
  const dialog = $("key-dialog");
  if (!dialog.open) dialog.show();
  $("api-key").focus();
}
function friendlyError(error) {
  if (error?.code === "NO_KEY" || error?.message === "NO_KEY") return "先在右上角设置里填上，我才能接着陪你。";
  if (error?.name === "AbortError") return "";
  if (error?.name === "TypeError") return "没连上。用网页打开，别直接双击那个文件。";
  return error?.message || "这次没成。";
}

async function attachMusic(query, reason, entry = draft) {
  if (draft === entry) $("music-status").textContent = "在找能听的…";
  try {
    const found = await searchMusic(query);
    entry.musicQuery = query;
    entry.musicSource = found.source;
    entry.tracks = found.tracks;
    if (reason) entry.musicReason = reason;
    if (entry.id) saveDb();
    if (draft === entry) paintResult();
  } catch {
    entry.tracks = [];
    entry.musicSource = "";
    if (draft === entry) {
      $("music-status").textContent = "歌没找到，换一批试试。";
      $("btn-reshuffle").hidden = false;
      toast("找歌那边暂时没回。");
    }
  }
}
async function attachVideo(entry, keyword) {
  const next = String(keyword || videoKeywordFor(entry)).trim().slice(0, 24);
  if (!next) return;
  entry.videoKeyword = next;
  if (draft === entry) paintVideo();
  let videos = await searchBilibili(next);
  if (!videos.length) videos = presetVideos(matchPreset(entry));
  entry.videos = videos;
  entry.video = videos[0] || null;
  entry.videoReason = `这三支是按「${next}」搜到的前几条，点进去就是视频。`;
  if (entry.id) saveDb();
  if (draft === entry) paintVideo();
}
function fallbackQuestion(entry, index) {
  const lines = [
    "这件事发生的时候，你身体哪里最明显？",
    "当时旁边有人吗？对方说了什么，或者没说什么？",
    "这件事情里，你最想先放下的是哪一句？",
  ];
  return lines[index] || lines[2];
}
function paintFollow() {
  const box = $("follow-box");
  if (!box) return;
  const waiting = state.busy === "ask" && !draft.pendingQuestion && !draft.followDone;
  const show = waiting || (Boolean(draft.pendingQuestion) && !draft.followDone);
  if (!show) {
    if (box.open) box.close();
    return;
  }
  if (!box.open) box.showModal();
  const step = (draft.followups || []).length + 1;
  const button = $("follow-send");
  if (waiting) {
    $("follow-step").textContent = "先问你";
    $("follow-q").textContent = "我先想一句要问你的。";
    button.disabled = true;
    button.textContent = "在想…";
    return;
  }
  $("follow-step").textContent = `第 ${step} / 3 句`;
  $("follow-q").textContent = draft.pendingQuestion;
  button.disabled = state.busy === "ask" || state.busy === "diary";
  button.textContent = state.busy === "ask" ? "在听…" : (step === 3 ? "说完了，帮我看看" : "就这句");
  if (document.activeElement !== $("follow-a")) $("follow-a").focus();
}
async function nextQuestion(entry) {
  const asked = (entry.followups || []).map((item, index) => `${index + 1}. 问：${item.q}\n答：${item.a}`).join("\n");
  const content = await complete({
    temperature: 0.7,
    json: true,
    maxTokens: 240,
    messages: [
      { role: "system", content: "你是心理咨询师。只问一个新的、具体的问题，把这件事问清楚。先问，先不要写成日记，不要分析，不要建议，不要说自己是人工智能。只输出 JSON：{\"question\":\"一句口语\"}" },
      { role: "user", content: `心情：${entry.emotion}\n原话：${entry.brief}\n日记：${entry.diary || "（还没写成）"}\n已经问过：\n${asked || "（还没有）"}\n请出第 ${(entry.followups || []).length + 1} 个问题。` },
    ],
  });
  const raw = parseJson(content);
  return String(raw.question || "").trim() || fallbackQuestion(entry, (entry.followups || []).length);
}
async function analyzeEntry(entry) {
  const extra = (entry.followups || []).map((item, index) => `${index + 1}. 问：${item.q}\n答：${item.a}`).join("\n");
  const content = await complete({
    temperature: 0.7,
    json: true,
    maxTokens: 1600,
    messages: [
      { role: "system", content: DIARY_SYSTEM },
      { role: "user", content: `日期：${entry.date}\n心情：${entry.emotion}\n分数：${entry.moodScore}\n原话：${entry.brief}\n已经写成的日记：${entry.diary}\n三句追问：\n${extra}\n日记不要重写。请根据日记和这三句补充，给出心情疗愈诊断、触发、坐一下、动一动、音乐和 B 站搜索词。videoKeyword 必须贴着他刚才说的具体事，不要一律写成焦虑。` },
    ],
  });
  const raw = parseJson(content);
  const written = String(raw.diary || "").trim();
  if (written) entry.diary = written;
  entry.title = String(raw.title || entry.title || "").replace(/\s+/g, "").slice(0, 24);
  entry.triggers = Array.isArray(raw.triggers) ? raw.triggers.map((item) => String(item).slice(0, 16)).filter(Boolean).slice(0, 3) : [];
  entry.analysis = String(raw.analysis || "").trim();
  entry.meditation = String(raw.meditation || "").trim();
  entry.movement = String(raw.movement || "").trim();
  entry.musicQuery = String(raw.musicQuery || MUSIC_FALLBACK[entry.emotion] || "calm piano").slice(0, 80);
  entry.musicReason = String(raw.musicReason || "").trim();
  entry.videoKeyword = String(raw.videoKeyword || VIDEO_KEYWORD[entry.emotion] || "").trim().slice(0, 24);
  entry.videoReason = String(raw.videoReason || "").trim();
  entry.updatedAt = new Date().toISOString();
  saveDb();
  if (draft === entry) paintWrite();
  await Promise.all([
    attachMusic(entry.musicQuery, entry.musicReason, entry),
    attachVideo(entry, entry.videoKeyword),
  ]);
}
async function answerFollow() {
  const answer = $("follow-a").value.trim();
  if (!answer) {
    toast("先回一句。");
    return;
  }
  if (!draft.pendingQuestion || state.busy) return;
  const entry = draft;
  entry.followups = entry.followups || [];
  entry.followups.push({ q: entry.pendingQuestion, a: answer });
  $("follow-a").value = "";
  entry.pendingQuestion = "";
  if (entry.followups.length >= 3) {
    entry.followDone = true;
    entry.pendingQuestion = "";
    commitDraft();
    if (draft === entry) paintFollow();
    state.busy = "diary";
    setWriting(true);
    syncButtons();
    try {
      await analyzeEntry(entry);
    } catch (error) {
      const msg = friendlyError(error);
      if (msg) toast(msg);
    } finally {
      state.busy = false;
      setWriting(false);
      syncButtons();
      if (draft === entry) paintWrite();
    }
    return;
  }
  state.busy = "ask";
  if (draft === entry) paintFollow();
  try {
    entry.pendingQuestion = await nextQuestion(entry);
  } catch (error) {
    entry.pendingQuestion = fallbackQuestion(entry, entry.followups.length);
    const msg = friendlyError(error);
    if (msg) toast(msg);
  } finally {
    state.busy = false;
    commitDraft();
    syncButtons();
    if (draft === entry) paintFollow();
  }
}
async function saveOnly() {
  draft.brief = $("brief").value;
  if (!(draft.brief || "").trim() && !(draft.diary || "").trim()) {
    toast("先写一句再存。");
    return;
  }
  if (!requireMood()) return;
  if (!draft.diary) draft.diary = draft.brief.trim();
  if (!draft.musicReason) draft.musicReason = `你选了${draft.emotion}，先放段安静点的。`;
  if (!draft.videoReason) {
    draft.videoReason = isCrisis(`${draft.brief}\n${draft.diary}`)
      ? "先打电话。想看的话，B 站上也有人讲怎么找人帮忙。"
      : `心情是${draft.emotion}的话，B 站上有人专门讲这个时候怎么办。`;
  }
  commitDraft();
  paintWrite();
  toast("记在这台浏览器里了。");
  const query = draft.musicQuery || MUSIC_FALLBACK[draft.emotion] || "calm piano";
  const videoKeyword = draft.analysis && draft.videoKeyword ? draft.videoKeyword : videoKeywordFor({ ...draft, videoKeyword: "" });
  const musicTask = (!draft.tracks || !draft.tracks.length) ? attachMusic(query, draft.musicReason, draft) : Promise.resolve();
  await Promise.all([musicTask, attachVideo(draft, videoKeyword)]);
}
async function generate() {
  draft.brief = $("brief").value.trim();
  if (draft.brief.length < 2) {
    toast("再多写几个字，一句也行。");
    return;
  }
  if (!requireMood()) return;
  if (!hasKey()) {
    toast("右上角点设置，填上之后我才能写。");
    openKey();
    return;
  }
  const entry = draft;
  entry.followups = [];
  entry.followDone = false;
  entry.pendingQuestion = "";
  entry.analysis = "";
  entry.meditation = "";
  entry.movement = "";
  entry.triggers = [];
  entry.videos = [];
  entry.video = null;
  commitDraft();
  state.busy = "diary";
  setWriting(true);
  syncButtons();
  try {
    const content = await complete({
      temperature: 0.8,
      json: true,
      maxTokens: 1200,
      messages: [
        { role: "system", content: "你是心理咨询师。只把来访者的一句短话收成第一人称日记。先不要分析，不要建议，不要提问，不要说自己是人工智能。日记用口语，180到320字，不编造他没说的人和事。只输出 JSON：{\"title\":\"不超过12个字\",\"diary\":\"...\"}" },
        { role: "user", content: `日期：${entry.date}\n心情：${entry.emotion}\n分数（10分最好）：${entry.moodScore}\n原话：\n${entry.brief}` },
      ],
    });
    const raw = parseJson(content);
    entry.title = String(raw.title || "").replace(/\s+/g, "").slice(0, 24);
    entry.diary = String(raw.diary || "").trim();
    if (!entry.diary) throw new Error("这次没写成一段，再试一次。");
    entry.updatedAt = new Date().toISOString();
    saveDb();
    state.busy = false;
    setWriting(false);
    syncButtons();
    if (draft === entry) paintWrite();
    state.busy = "ask";
    syncButtons();
    if (draft === entry) paintFollow();
    try {
      entry.pendingQuestion = await nextQuestion(entry);
    } catch (error) {
      entry.pendingQuestion = fallbackQuestion(entry, 0);
      const msg = friendlyError(error);
      if (msg) toast(msg);
    }
  } catch (error) {
    const msg = friendlyError(error);
    if (msg) toast(msg);
  } finally {
    state.busy = false;
    setWriting(false);
    saveDb();
    syncButtons();
    if (draft === entry) paintWrite();
  }
}

function talkSystem(entry) {
  return `你是心理咨询师，坐在对面向来访者说话。不要说自己是人工智能、模型、程序或 AI，也不要提任何接口、密钥或技术。
先接住他刚说的，再给一个现在就能做的小事。每次几句，像当面说话，别像文章，别像报告。
不要用这些腔：我听到你、你的感受是有效的、允许自己、值得注意的是、首先其次、让我们一起。
不要连环追问，不要表情符号，不要给病名，不要开药。
如果他提到自伤、自杀或不想活：当真话听，请他马上联系身边的人或打电话（全国心理援助热线 12356，北京心理危机研究与干预中心 010-82951332，生命热线 400-821-1215）。不要讲任何方法，也不要评价对错。

来访者写下的：
日期：${entry.date}
心情：${entry.emotion || "没选"}，${entry.moodScore} 分（10 分最好）
原话：${entry.brief || "（没写）"}
日记：${entry.diary || "（还没写成段）"}
可能碰到的事：${(entry.triggers || []).join("、") || "（还没有）"}
你之前的看法：${entry.analysis || "（还没写完三句追问）"}
他补充过的话：
${(entry.followups || []).map((item, index) => `${index + 1}. 你问：${item.q}\n他答：${item.a}`).join("\n") || "（还没有）"}`;
}
async function sendTalk(text) {
  const content = (text || "").trim();
  if (!content || state.busy) return;
  if (!draft?.id) {
    toast("先写一条再聊。");
    return;
  }
  if (!hasKey()) {
    openKey();
    return;
  }
  const entry = draft;
  entry.messages = entry.messages || [];
  entry.messages.push({ role: "user", content, at: new Date().toISOString() });
  $("talk-input").value = "";
  state.busy = "talk";
  paintTalk();
  paintCrisis($("crisis-talk"), content);
  const history = entry.messages.slice(-8).map((message) => ({ role: message.role, content: message.content }));
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant";
  bubble.textContent = "在听…";
  $("talk-log").append(bubble);
  const controller = new AbortController();
  state.talkAbort = controller;
  let errorNote = "";
  try {
    const reply = await streamChat({
      signal: controller.signal,
      messages: [{ role: "system", content: talkSystem(entry) }, ...history],
      onDelta: (full) => {
        bubble.textContent = full;
        $("talk-log").scrollTop = $("talk-log").scrollHeight;
      },
    });
    const finalText = reply || "我在。要不再说一句，现在身体是什么感觉？";
    entry.messages.push({ role: "assistant", content: finalText, at: new Date().toISOString() });
    saveDb();
  } catch (error) {
    const partial = bubble.textContent;
    if (error?.name === "AbortError" && partial && partial !== "在听…") {
      entry.messages.push({ role: "assistant", content: partial, at: new Date().toISOString() });
      saveDb();
    } else {
      errorNote = friendlyError(error);
    }
  } finally {
    state.busy = false;
    state.talkAbort = null;
    if (draft === entry) {
      paintTalk();
      if (errorNote) {
        const note = document.createElement("div");
        note.className = "bubble note";
        note.textContent = errorNote;
        $("talk-log").append(note);
      }
      paintCrisis($("crisis-talk"), `${entry.brief}\n${entry.diary}\n${entry.messages.map((m) => m.content).join("\n")}`);
    }
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
    toast("这首放不了，换一首。");
    state.audioId = null;
  });
  paintTracks();
}
function stopBreath() {
  if (state.breath) clearTimeout(state.breath);
  state.breath = null;
  $("breath-orb").classList.remove("inhale", "exhale");
  $("breath-label").textContent = "准备好了就开始";
  $("btn-breath").textContent = "开始，大概一分钟";
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
      $("breath-label").textContent = `吸气，还剩 ${left} 次`;
      state.breath = setTimeout(() => step("out"), 4000);
    } else {
      orb.classList.add("exhale");
      $("breath-label").textContent = "慢慢呼气";
      left -= 1;
      state.breath = setTimeout(() => {
        if (left <= 0) stopBreath();
        else step("in");
      }, 6000);
    }
  };
  $("btn-breath").textContent = "停";
  step("in");
}

const DIARY_SYSTEM = `你是心理咨询师。先把来访者的一句短话收成他的日记，再用你的口吻告诉他你看下来是什么。不要说自己是人工智能、模型或程序，不要提接口和密钥。中文要像当面说话，不要像翻译，不要像公众号。

规则：
- 只按用户给出的事实写。可以补身体感觉，不要编他没说的人、地点、事、诊断。
- 已经写得差不多，就收拾一下，别注水。
- 留下他的原词。
- 日记 180 到 320 个字，第一人称，可以有半句和口头语。不要鸡汤，不要“亲爱的”，不要表情符号。
- 禁止这些说法：首先、其次、值得注意的是、让我们、在这个快节奏的、毋庸置疑、深深地感受到、不禁、缓缓。
- 分析用咨询师对来访者说话的口吻，说你听下来，可能是哪件事碰上来的。用“也许”“像是”。不要给病名，不要说“你患有”。80 到 140 字，同样口语。
- 坐一下：现在就能做的一分钟，具体到呼吸或身体。
- 动一动：十分钟以内，在屋里也能做。
- musicQuery 用英文，3 到 6 个词，写氛围和乐器，适合搜轻音乐。不要点名某首流行歌。
- musicReason、videoReason 用口语中文，一句。
- videoKeyword 写成像在 B 站搜索框里打的几个字，例如“怎么缓解焦虑”“累了怎么休息”。不要写成标题，不要点名某一期视频。
- 如果出现自伤、自杀或不想活：不要写任何方法。日记只接住情绪。分析里明说马上找人或打热线。坐一下改成脚踩地、看看周围有什么。videoKeyword 用“心情崩溃怎么办”。
- 只输出一个 JSON 对象，不要 Markdown。

字段：
{"title":"不超过12个字","diary":"...","emotion":"开心|平静|期待|累|焦虑|低落|心烦","moodScore":1到10的整数,"triggers":["最多3个，每个不超过12字"],"analysis":"80到140字","meditation":"...","movement":"...","musicQuery":"english","musicReason":"一句口语","videoKeyword":"B站搜索词","videoReason":"一句口语"}`;

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
  $("follow-send").addEventListener("click", () => answerFollow());
  $("follow-box").addEventListener("cancel", (event) => event.preventDefault());
  $("follow-a").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      answerFollow();
    }
  });
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      show(link.dataset.route);
    });
  });
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
    if (!confirm("这条会从这台浏览器删掉，找不回来。")) return;
    db.entries = db.entries.filter((entry) => entry.id !== draft.id);
    saveDb();
    draft = todayLatest() || blankDraft();
    paintWrite();
    toast("删了。");
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
      $("key-msg").textContent = "这个地址不像网址。";
      return;
    }
    db.settings.apiKey = $("api-key").value.trim();
    db.settings.model = $("api-model").value;
    saveDb();
    paintKey();
    $("key-dialog").close();
    toast(hasKey() ? "好，我能陪你了。" : "还空着，我还没法接着写。");
  });
  $("clear-key").addEventListener("click", () => {
    db.settings.apiKey = "";
    saveDb();
    $("api-key").value = "";
    paintKey();
    $("key-msg").textContent = "清掉了。";
  });
  $("test-key").addEventListener("click", async () => {
    const previous = db.settings.apiKey;
    db.settings.apiKey = $("api-key").value.trim();
    db.settings.model = $("api-model").value;
    try { db.settings.baseUrl = new URL($("api-base").value).origin; } catch {
      $("key-msg").textContent = "这个地址不像网址。";
      db.settings.apiKey = previous;
      return;
    }
    $("key-msg").textContent = "我试一下…";
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
      $("key-msg").textContent = reply.trim() ? "能用。" : "有回复，但是空的。";
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
    if (!confirm("清掉这段聊天？日记还留着。")) return;
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
    toast("这首放不了，换一首。");
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
