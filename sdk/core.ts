import fs from "node:fs";

export const _emoji: Record<string, string> = {
  owner: "👑",
  premium: "💎",
  group: "👥",
  admin: "🛡️",
  botadmin: "🤖",
  private: "🔒",
  banned: "⛔",
  limit: "⚠️",
  reg: "📝",
  nsfw: "🔞",
  cooldown: "",
  error: "❗",
  success: "✅",
  info: "ℹ️",
  warn: "🚩",
  done: "🚀"
};

export const _status: Record<string, string> = {
  owner: "Only the owner can use this feature.",
  premium: "This feature is for premium users only.",
  group: "This feature can only be used in groups.",
  admin: "This feature is for group admins only.",
  botadmin: "I need to be an admin to use this feature.",
  private: "This feature can only be used in private chats.",
  banned: "You have been banned from using the bot.",
  limit: "You reached the daily limit. It resets at midnight.",
  reg: "You must register first to use this feature.",
  nsfw: "This feature is marked 18+.",
  cooldown: "Slow down! Wait a moment before using this feature again.",
  error: "Something went wrong, try again later."
};

export function emoji(key: string): string {
  return _emoji[key] || "";
}

export function status(key: string, custom?: string): string {
  const text = custom || _status[key] || _status.error;
  return _emoji[key] ? _emoji[key] + " " + text : text;
}

export function sec(title: string): string {
  return "\n──── " + title + " ────\n";
}

export function panel(title: string, lines: string[], empty?: string): string {
  const body = list(lines, empty);
  return title ? sec(title) + body : body;
}

export function texted(style: string, text: unknown): string {
  const s = String(text == null ? "" : text);
  switch (style) {
    case "bold":
      return "*" + s + "*";
    case "italic":
      return "_" + s + "_";
    case "mono":
      return "`" + s + "`";
    case "strike":
      return "~" + s + "~";
    case "underline":
      return "__" + s + "__";
    case "quote":
      return "> " + s;
    case "code":
      return "```\n" + s + "\n```";
    default:
      return s;
  }
}

export function jsonFmt(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export function toTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(d + " day" + (d > 1 ? "s" : ""));
  if (h) parts.push(h + " hour" + (h > 1 ? "s" : ""));
  if (m) parts.push(m + " minute" + (m > 1 ? "s" : ""));
  if (sec || !parts.length) parts.push(sec + " second" + (sec !== 1 ? "s" : ""));
  return parts.join(", ");
}

export function list(items: unknown[] | undefined, empty?: string): string {
  if (!items || !items.length) return empty || "_Nothing here._";
  return items.map((v, i) => "`" + (i + 1) + ".` " + v).join("\n");
}

export interface MatchResult {
  string: string;
  accuracy: number;
}

export function matcher(input: string, commands: (string | number)[]): MatchResult[] {
  const results: MatchResult[] = [];
  for (const cmd of commands) {
    const c = String(cmd);
    let accuracy = 0;
    if (input === c) {
      accuracy = 100;
    } else if (c.startsWith(input)) {
      accuracy = 80;
    } else if (c.includes(input)) {
      accuracy = 70;
    } else {
      const ic = input.split("");
      const cc = c.split("");
      let matches = 0;
      for (const ch of ic) {
        if (cc.includes(ch)) matches++;
      }
      accuracy = Math.round((matches / Math.max(ic.length, cc.length)) * 60);
    }
    if (accuracy >= 60) results.push({ string: c, accuracy });
  }
  return results.sort((a, b) => b.accuracy - a.accuracy);
}

export function pad(n: number | string, len = 2): string {
  return String(n).padStart(len, "0");
}

export function cap(text: unknown): string {
  const s = String(text || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ucword(text: unknown): string {
  return String(text || "")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function greeting(hour?: number, lang?: string): string {
  const h = hour === undefined ? new Date().getHours() : Number(hour);
  if (String(lang || "").toLowerCase().startsWith("en")) {
    if (h >= 18) return "Good Night";
    if (h >= 11) return "Good Afternoon";
    if (h >= 4) return "Good Morning";
    return "Good Night";
  }
  if (h >= 3 && h < 10) return "Selamat pagi";
  if (h >= 10 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

export function similarity(str1: unknown, str2: unknown): number {
  if (!str1 || !str2) return 0;
  const a = String(str1).toLowerCase().trim();
  const b = String(str2).toLowerCase().trim();
  if (a === b) return 1;
  const pairs = (s: string): string[] => {
    const res: string[] = [];
    for (let i = 0; i < s.length - 1; i++) res.push(s.slice(i, i + 2));
    return res;
  };
  const pairs1 = pairs(a);
  const pairs2 = pairs(b);
  const union = pairs1.length + pairs2.length;
  if (!union) return 0;
  let hits = 0;
  for (const p of pairs1) {
    const idx = pairs2.indexOf(p);
    if (idx !== -1) {
      hits++;
      pairs2.splice(idx, 1);
    }
  }
  return (2 * hits) / union;
}

export function toBytes(str: unknown): number {
  const m = String(str == null ? "" : str)
    .trim()
    .match(/^([\d.]+)\s*([kmgt]?b?)?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  const mult = unit.startsWith("t")
    ? 1099511627776
    : unit.startsWith("g")
      ? 1073741824
      : unit.startsWith("m")
        ? 1048576
        : unit.startsWith("k")
          ? 1024
          : 1;
  return Math.floor(n * mult);
}

export function logFile(msg: unknown, file?: string): boolean {
  try {
    fs.appendFileSync(file || "./error.log", `[${new Date().toISOString()}] ${String(msg == null ? "" : msg)}\n`);
    return true;
  } catch {
    return false;
  }
}

const ROLES: [string, number][] = [
  ["Warrior", 0], ["Paladin", 20], ["Sorcerer", 40], ["Ranger", 60], ["Mage", 80],
  ["Cleric", 100], ["Thief", 120], ["Assassin", 140], ["Monk", 160], ["Bard", 180],
  ["Necromancer", 200], ["Warlock", 220], ["Wizard", 240], ["Sage", 260], ["Priest", 280],
  ["Rogue", 300], ["Brawler", 320], ["Archer", 340], ["Sniper", 360], ["Ninja", 380],
  ["Samurai", 400], ["Berserker", 420], ["Legend", 440], ["Champion", 460], ["Grandmaster", 480],
  ["Elder", 500], ["Immortal", 520], ["Nephalem", 540], ["Eternal", 560], ["Neptune", 580],
  ["Pluto", 600], ["Eris", 620], ["Ascension", 640], ["Elysium", 660], ["Ether", 680],
  ["Gaea", 700], ["Hades", 720], ["Heimdall", 740], ["Hyperion", 760], ["Iris", 780],
  ["Jupiter", 800], ["Kronos", 820], ["Lilith", 840], ["Maelstrom", 860], ["Nova", 880],
  ["Odin", 900], ["Osiris", 920], ["Poseidon", 940], ["Ragnarok", 960], ["Saturn", 980],
  ["Titan", 1000], ["Uranus", 1020], ["Venus", 1040], ["Zeus", 1060]
];

export interface Role {
  name: string;
  level: number | "";
}

export function role(level: unknown): Role {
  const n = parseInt(String(level));
  if (isNaN(n)) return { name: "", level: "" };
  const numerals = ["", "I", "II", "III", "IV", "V"];
  let out: Role = { name: "Warrior V", level: 0 };
  for (const [name, base] of ROLES) {
    for (let tier = 5; tier >= 1; tier--) {
      const at = base + (5 - tier) * 4;
      if (n >= at) out = { name: `${name} ${numerals[tier]}`, level: at };
    }
  }
  return out;
}

export function xpForLevel(level: unknown): number {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return 50 * n * (n + 1);
}

export interface LevelStats {
  level: number;
  role: Role;
  curXp: number;
  nextXp: number;
  progress: number;
}

export function levelStats(xp: unknown): LevelStats {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 0;
  while (xpForLevel(level + 1) <= total) level++;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, role: role(level), curXp: total - cur, nextXp: next - cur, progress: next > cur ? (total - cur) / (next - cur) : 1 };
}

export function example(isPrefix: string, command: string, botname: string): string {
  if (!isPrefix || !command) return "";
  return "Example: " + isPrefix + command + " " + botname;
}

export function toDate(ms: number): string {
  const n = Number(ms);
  if (!isFinite(n) || n <= 0) return "Just now";
  const elapsed = n > 1e11 ? Date.now() - n : n;
  if (elapsed <= 0) return "Just now";
  const s = Math.floor(elapsed / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(d + " day" + (d > 1 ? "s" : ""));
  if (h) parts.push(h + " hour" + (h > 1 ? "s" : ""));
  if (m) parts.push(m + " minute" + (m > 1 ? "s" : ""));
  if (sec || !parts.length) parts.push(sec + " second" + (sec !== 1 ? "s" : ""));
  return parts.join(" ") + " ago";
}

export function timeReverse(ms: number): string {
  const n = Number(ms);
  if (!isFinite(n) || n <= 0) return "0 seconds";
  const s = Math.floor(n / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(d + " day" + (d > 1 ? "s" : ""));
  if (h) parts.push(h + " hour" + (h > 1 ? "s" : ""));
  if (m) parts.push(m + " minute" + (m > 1 ? "s" : ""));
  if (sec || !parts.length) parts.push(sec + " second" + (sec !== 1 ? "s" : ""));
  return parts.join(" ");
}

export function formatNumber(n: unknown): string {
  const num = Number(n);
  if (n == null || isNaN(num)) return String(n == null ? "0" : n);
  try {
    return num.toLocaleString("id-ID");
  } catch {
    return new Intl.NumberFormat("id-ID").format(num);
  }
}

export function isUrl(str: unknown): boolean {
  return /https?:\/\/[^\s]+/i.test(String(str || ""));
}

export function jsonFormat(err: unknown): string {
  if (err instanceof Error) {
    return "Type: " + err.name + "\nMessage: " + err.message + "\nStack: " + err.stack;
  }
  return jsonFmt(err);
}

type StyleFn = (s: string) => string;

const _style: Record<string, Record<string, StyleFn>> = {
  whatsapp: {
    bold: (s) => "*" + s + "*",
    italic: (s) => "_" + s + "_",
    mono: (s) => "`" + s + "`",
    strike: (s) => "~" + s + "~",
    underline: (s) => "__" + s + "__",
    quote: (s) => "> " + s,
    code: (s) => "```\n" + s + "\n```"
  },
  telegram: {
    bold: (s) => "<b>" + s + "</b>",
    italic: (s) => "<i>" + s + "</i>",
    mono: (s) => "<code>" + s + "</code>",
    strike: (s) => "<s>" + s + "</s>",
    underline: (s) => "<u>" + s + "</u>",
    quote: (s) => "<blockquote>" + s + "</blockquote>",
    code: (s) => "<pre>" + s + "</pre>"
  },
  discord: {
    bold: (s) => "**" + s + "**",
    italic: (s) => "*" + s + "*",
    mono: (s) => "`" + s + "`",
    strike: (s) => "~~" + s + "~~",
    underline: (s) => "__" + s + "__",
    quote: (s) => "> " + s,
    code: (s) => "```\n" + s + "\n```",
    spoiler: (s) => "||" + s + "||"
  }
};

export function styled(platform: string, style: string, text: unknown): string {
  const k = String(platform || "").toLowerCase();
  const name = k === "whatsapp" || k === "wa" ? "whatsapp" : k === "telegram" || k === "tg" ? "telegram" : "discord";
  const p = _style[name] || _style.whatsapp;
  const fn = p[style] || ((s: string) => String(s));
  return fn(String(text == null ? "" : text));
}

export interface Styler {
  (s: string): string;
  whatsapp: (s: string) => string;
  telegram: (s: string) => string;
  discord: (s: string) => string;
  wa: (s: string) => string;
  tg: (s: string) => string;
  dc: (s: string) => string;
}

function mksty(style: string): Styler {
  const f = ((s: string) => styled("whatsapp", style, s)) as Styler;
  f.whatsapp = (s) => styled("whatsapp", style, s);
  f.telegram = (s) => styled("telegram", style, s);
  f.discord = (s) => styled("discord", style, s);
  f.wa = f.whatsapp;
  f.tg = f.telegram;
  f.dc = f.discord;
  return f;
}

export const bold = mksty("bold");
export const italic = mksty("italic");
export const mono = mksty("mono");
export const strike = mksty("strike");
export const underline = mksty("underline");
export const quote = mksty("quote");
export const code = mksty("code");

export function spaced(title: unknown): string {
  return String(title || "").split("").join(" ");
}

export function esc(text: unknown): string {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface UserCardData {
  name?: unknown;
  id?: unknown;
  username?: unknown;
  limit?: unknown;
  hit?: unknown;
  exp?: unknown;
  money?: unknown;
  warning?: unknown;
  accountCreated?: unknown;
  joined?: unknown;
  lastseen?: unknown;
  blocked?: unknown;
  banned?: unknown;
  bot?: unknown;
  registered?: unknown;
  usePrivate?: unknown;
  premium?: unknown;
  expired?: unknown;
  footer?: unknown;
}

export function userCard(platform: string, d: UserCardData = {}): string {
  const B = (s: string) => styled(platform, "bold", s);
  const E = platform === "telegram" || platform === "tg" ? esc : (s: string) => s;
  const mark = (v: unknown) => (v ? "√" : "×");
  const row = (k: string, v: unknown) => "\t◦  " + B(k) + " : " + (v == null || v === "" ? "-" : E(v as string));
  const L: string[] = [];
  L.push("乂  " + B(spaced("USER-PROFILE")));
  L.push("");
  if (d.name !== undefined) L.push(row("Name", d.name));
  if (d.id !== undefined) L.push(row("ID", d.id));
  if (d.username !== undefined) L.push(row("Username", d.username));
  if (d.limit !== undefined) L.push(row("Limit", d.limit));
  if (d.hit !== undefined) L.push(row("Hitstat", d.hit));
  if (d.exp !== undefined) L.push(row("Exp", d.exp));
  if (d.money !== undefined) L.push(row("Money", d.money));
  if (d.warning !== undefined) L.push(row("Warning", d.warning));
  if (d.accountCreated !== undefined) L.push(row("Created", d.accountCreated));
  if (d.joined !== undefined) L.push(row("Joined", d.joined));
  if (d.lastseen !== undefined) L.push(row("Last Seen", d.lastseen));
  L.push("");
  L.push("乂  " + B(spaced("USER-STATUS")));
  L.push("");
  if (d.blocked !== undefined) L.push(row("Blocked", mark(d.blocked)));
  if (d.banned !== undefined) L.push(row("Banned", typeof d.banned === "string" ? d.banned : mark(d.banned)));
  if (d.bot !== undefined) L.push(row("Bot", mark(d.bot)));
  if (d.registered !== undefined) L.push(row("Registered", mark(d.registered)));
  if (d.usePrivate !== undefined) L.push(row("Use In Private", mark(d.usePrivate)));
  if (d.premium !== undefined) L.push(row("Premium", mark(d.premium)));
  if (d.expired !== undefined) L.push(row("Expired", d.expired));
  if (d.footer) {
    L.push("");
    L.push(platform === "telegram" || platform === "tg" ? esc(d.footer) : (d.footer as string));
  }
  return L.join("\n");
}

export function toTimeShort(ms: number): string {
  const s = Math.floor(Number(ms) / 1000);
  if (!isFinite(s) || s < 0) return "0s";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatSize(size: unknown): string {
  const n = Number(size);
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)}${units[i]}`;
}

export function isNumber(x: unknown): boolean {
  if (typeof x === "number") return !isNaN(x);
  if (typeof x !== "string" || !x.trim()) return false;
  return !isNaN(Number(x));
}

export function getRandom<T>(list: T[] | string): T | string;
export function getRandom(list: number): number;
export function getRandom(list: unknown): unknown {
  if (Array.isArray(list) || typeof list === "string") return (list as unknown[])[Math.floor(Math.random() * (list as unknown[]).length)];
  return Math.floor(Math.random() * Number(list));
}

export function generateLink(text: unknown): string[] {
  return String(text || "").match(/https?:\/\/[^\s]+/gi) || [];
}

export function socmed(url: unknown): boolean {
  return [/tiktok\.com/, /instagram\.com/, /facebook\.com/, /fb\.watch/, /twitter\.com/, /x\.com/, /youtube\.com/, /youtu\.be/, /pinterest\.com/, /pin\.it/, /mediafire\.com/].some((p) => p.test(String(url || "")));
}

export function parseMention(text = "", suffix = "@s.whatsapp.net"): string[] {
  if (!text || typeof text !== "string") return [];
  return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map((v) => v[1] + suffix);
}

export interface SizeLimit {
  oversize: boolean;
  size?: string;
  bytes?: number;
}

export function sizeLimit(size: unknown, maxMB: number): SizeLimit {
  const max = Number(maxMB);
  if (typeof size === "number" && isFinite(size)) {
    const mb = size / (1024 * 1024);
    return { oversize: mb > max, size: `${parseFloat(mb.toFixed(1))}MB`, bytes: size };
  }
  const upperStr = String(size ?? "").toUpperCase().trim();
  if (!upperStr) return { oversize: true };
  if (/G(B)?|T(B)?/.test(upperStr)) return { oversize: true };
  const num = parseFloat(upperStr.replace(/MB|M|KB|K|B/gi, "").trim());
  if (isNaN(num)) return { oversize: true };
  let mb = num;
  if (/K(B)?/.test(upperStr)) mb = num / 1024;
  else if (!/M(B)?/.test(upperStr)) mb = num / (1024 * 1024);
  return { oversize: mb > max, size: `${parseFloat(mb.toFixed(1))}MB`, bytes: Math.round(mb * 1024 * 1024) };
}

export const TG_DOWNLOAD_MAX = 20971520;
export const TG_UPLOAD_MAX = 52400000;
export const TG_PHOTO_MAX = 10485760;
export const TG_URL_PHOTO_MAX = 5242880;
export const TG_CAPTION_MAX = 1024;
export const TG_TEXT_MAX = 4096;
export const TG_CALLBACK_MAX = 64;
