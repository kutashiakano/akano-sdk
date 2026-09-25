import * as core from "../sdk/core.js";
import * as WA from "../sdk/whatsapp.js";
import * as text from "../sdk/text.js";
import * as menu from "../sdk/menu.js";
import fs from "node:fs";
import { need } from "../sdk/loader.js";

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeId(len?: number): string {
  const n = len || 8;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function fetchUrl(url: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, Object.assign({ headers: { "User-Agent": "Mozilla/5.0" } }, opts || {}));
  if (!res.ok) throw new Error("Fetch failed: HTTP " + res.status);
  return res;
}

export interface FileInfo {
  data: Buffer;
  mime: string;
  ext: string;
}

export async function getFile(src: unknown): Promise<FileInfo> {
  let data: Buffer;
  if (Buffer.isBuffer(src)) {
    data = src;
  } else if (typeof src === "string" && /^https?:\/\//.test(src)) {
    const res = await fetchUrl(src);
    data = Buffer.from(await res.arrayBuffer());
  } else if (typeof src === "string" && fsExists(src)) {
    data = fs.readFileSync(src);
  } else {
    throw new Error("getFile: unsupported source.");
  }
  let type = { mime: "application/octet-stream", ext: "bin" };
  try {
    const FileType = need("file-type");
    type = (await FileType.fromBuffer(data)) || type;
  } catch {  }
  return { data, mime: type.mime, ext: type.ext };
}

export function fsExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export const mention = WA.mention;
export const parseMention = core.parseMention;
export const formatSize = core.formatSize;
export const getSize = core.formatSize;
export const ucword = core.ucword;
export const greeting = core.greeting;
export const similarity = core.similarity;
export const toBytes = core.toBytes;
export const logFile = core.logFile;
export const role = core.role;
export const xpForLevel = core.xpForLevel;
export const levelStats = core.levelStats;
export const isUrl = core.isUrl;
export const jsonFormat = core.jsonFormat;
export const jsonFmt = core.jsonFmt;
export const toTime = core.toTime;
export const toTimeShort = core.toTimeShort;
export const texted = core.texted;
export const matcher = core.matcher;
export const B = text.B;
export const I = text.I;
export const Code = text.Code;
export const Strike = text.Strike;
export const Link = text.Link;
export const Esc = text.Esc;
export const sanitize = text.sanitize;
export const splitSmart = text.splitSmart;
export const stripMd = text.stripMd;
export { menu };
