export type PlatformName = "whatsapp" | "telegram" | "discord";

export function pick(platform: unknown): PlatformName {
  const p = String(platform || "").toLowerCase();
  if (p === "whatsapp" || p === "wa") return "whatsapp";
  if (p === "telegram" || p === "tg") return "telegram";
  return "discord";
}

export function B(text: unknown, platform?: unknown): string {
  const s = String(text == null ? "" : text);
  const p = pick(platform);
  if (p === "telegram") return "<b>" + s + "</b>";
  if (p === "whatsapp") return "*" + s + "*";
  return "**" + s + "**";
}

export function I(text: unknown, platform?: unknown): string {
  const s = String(text == null ? "" : text);
  const p = pick(platform);
  if (p === "telegram") return "<i>" + s + "</i>";
  if (p === "whatsapp") return "_" + s + "_";
  return "*" + s + "*";
}

export function Code(text: unknown, platform?: unknown): string {
  const s = String(text == null ? "" : text);
  const p = pick(platform);
  if (p === "telegram") return "<code>" + s + "</code>";
  return "`" + s + "`";
}

export function Strike(text: unknown, platform?: unknown): string {
  const s = String(text == null ? "" : text);
  const p = pick(platform);
  if (p === "telegram") return "<s>" + s + "</s>";
  if (p === "whatsapp") return "~" + s + "~";
  return "~~" + s + "~~";
}

export function Link(label: unknown, url: unknown, platform?: unknown): string {
  const t = String(label == null ? "" : label);
  const u = String(url || "");
  const p = pick(platform);
  if (p === "telegram") return `<a href="${u}">${t}</a>`;
  if (p === "discord") return `[${t}](${u})`;
  return t + " " + u;
}

export function Esc(text: unknown): string {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitize(src: unknown): string {
  let s = String(src == null ? "" : src);
  s = s.replace(/\[([^\]\n[]+)\]\(\s*\)/g, "$1");
  s = s.replace(/\[([^\]\n[]+)\(\)/g, "$1");
  s = s.replace(/\[([^\]\n[]+)\(\s*$/gm, "$1");
  s = s.replace(/\[([^\]\n\[]+)$/gm, "$1");
  const balance = (t: string, token: string): string => {
    let count = 0;
    let idx = 0;
    while ((idx = t.indexOf(token, idx)) !== -1) {
      count++;
      idx += token.length;
    }
    if (count % 2 === 1) {
      const last = t.lastIndexOf(token);
      t = t.slice(0, last) + t.slice(last + token.length);
    }
    return t;
  };
  s = balance(s, "**");
  s = balance(s, "`");
  return s;
}

export function splitSmart(text: unknown, max?: number): string[] {
  const s = String(text == null ? "" : text);
  const m = max || 1900;
  if (s.length <= m) return [s];
  const parts: string[] = [];
  const lines = s.split("\n");
  let cur = "";
  for (const line of lines) {
    if ((cur + "\n" + line).length > m && cur) {
      parts.push(cur);
      cur = "";
    }
    if (line.length > m) {
      let rest = line;
      while (rest.length > m) {
        parts.push(rest.slice(0, m));
        rest = rest.slice(m);
      }
      cur = rest;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) parts.push(cur);
  return parts.length ? parts : [s];
}

export function stripMd(src: unknown): string {
  let s = sanitize(src);
  s = s.replace(/```([\s\S]*?)```/g, "$1");
  s = s.replace(/\[([^\]\n[]+)\]\([^)\n]*\)/g, "$1");
  s = s.replace(/\*{3,}([^*]+)\*{3,}/g, "$1");
  s = s.replace(/\*{3,}/g, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/`([^`\n]+)`/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*>\s?/gm, "");
  s = s.replace(/^(\s*)[-*]\s+/gm, "$1• ");
  s = s.replace(/^(\s*)\d+\.\s+/gm, "$1• ");
  return s;
}
