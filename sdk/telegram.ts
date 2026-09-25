import fs from "node:fs";
import { need } from "./loader.js";

export function engine(): any {
  return need("grammy");
}

export function Esc(text: unknown): string {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function chop(text: unknown, max?: number): string[] {
  let s = String(text == null ? "" : text);
  const m = max || 3900;
  if (!s) return [];
  const out: string[] = [];
  while (s.length > m) {
    out.push(s.slice(0, m));
    s = s.slice(m);
  }
  out.push(s);
  return out;
}

export type ChatAction =
  | "typing"
  | "upload_photo"
  | "record_video"
  | "upload_video"
  | "record_voice"
  | "upload_voice"
  | "upload_document"
  | "choose_sticker"
  | "find_location"
  | "record_video_note"
  | "upload_video_note";

export async function presence(ctx: any, action?: ChatAction | string): Promise<unknown> {
  const a = action || "typing";
  try {
    if (ctx.replyWithChatAction) return await ctx.replyWithChatAction(a).catch(() => {});
    if (ctx.api && ctx.chat) return await ctx.api.sendChatAction(ctx.chat.id, a).catch(() => {});
  } catch {  }
  return undefined;
}

export async function typing(ctx: any): Promise<unknown> {
  return presence(ctx, "typing");
}

export async function reply(ctx: any, text: unknown, extra?: Record<string, unknown>): Promise<unknown> {
  const ex = extra || {};
  try {
    if (ctx.reply) return await ctx.reply(text, ex);
  } catch {  }
  return undefined;
}

export async function sendVideo(ctx: any, source: unknown, extra?: Record<string, unknown>): Promise<unknown> {
  const ex = extra || {};
  try {
    if (ctx.replyWithVideo) return await ctx.replyWithVideo(source, ex);
    if (ctx.api && ctx.chat) return await ctx.api.sendVideo(ctx.chat.id, source, ex);
  } catch {  }
  return undefined;
}

export async function setBio(api: any, bio: unknown, language_code?: string): Promise<unknown> {
  const payload: any = { description: String(bio || "").slice(0, 512) };
  if (language_code) payload.language_code = language_code;
  return api.setMyDescription(payload);
}

export async function setName(api: any, name: unknown, language_code?: string): Promise<unknown> {
  const payload: any = { name: String(name || "").slice(0, 64) };
  if (language_code) payload.language_code = language_code;
  return api.setMyName(payload);
}

export async function setShortDescription(api: any, desc: unknown, language_code?: string): Promise<unknown> {
  const payload: any = { short_description: String(desc || "").slice(0, 120) };
  if (language_code) payload.language_code = language_code;
  return api.setMyShortDescription(payload);
}

export function keyboard(rows: (string[] | { text: string; callback_data: string })[][]): { reply_markup: unknown } {
  return {
    reply_markup: {
      inline_keyboard: (rows || []).map((r) => (r || []).map((b) => (Array.isArray(b) ? { text: b[0], callback_data: b[1] } : b)))
    }
  };
}

export async function sendRetry<T>(fn: () => Promise<T>, tries?: number): Promise<T> {
  let last: unknown = null;
  const n = tries || 3;
  for (let i = 1; i <= n; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e as any)?.message || e);
      if (/429|retry after/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      if (!/hang up|timeout|ECONN|EPIPE|EAI_AGAIN|fetch failed|network/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, i * 3000));
    }
  }
  throw last;
}

export async function fetchFile(ctx: any, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  if (!file) throw new Error("File not found");
  if (typeof file.download === "function") {
    const tmp = await file.download();
    const buf = await fs.promises.readFile(tmp);
    try {
      await fs.promises.unlink(tmp).catch(() => {});
    } catch {  }
    return buf;
  }
  if (typeof file.getUrl === "function") {
    const res = await fetch(file.getUrl(), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error("Fetch failed: HTTP " + res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Download unavailable");
}

export async function answerTap(ctx: any, text: unknown): Promise<unknown> {
  const msg = String(text == null ? "" : text).slice(0, 200);
  return ctx.answerCallbackQuery(msg).catch(() => {});
}

export async function sendReact(ctx: any, emoji?: string): Promise<unknown> {
  try {
    if (ctx.react) return await ctx.react(emoji || "👍").catch(() => {});
    if (ctx.api && ctx.msg) return await ctx.api.setMessageReaction(ctx.chat.id, ctx.msg.message_id, [{ type: "emoji", emoji: emoji || "👍" }]).catch(() => {});
  } catch {  }
  return undefined;
}

export async function deleteMessageReaction(ctx: any, message_id?: number): Promise<unknown> {
  try {
    const mid = message_id || (ctx && ctx.msg && ctx.msg.message_id) || (ctx && ctx.message && ctx.message.message_id);
    if (!mid) return undefined;
    if (ctx.api && ctx.chat) return await ctx.api.deleteMessageReaction(ctx.chat.id, mid).catch(() => {});
  } catch {  }
  return undefined;
}

export async function sendLivePhoto(ctx: any, source: unknown, extra?: Record<string, unknown>): Promise<unknown> {
  const ex = extra || {};
  try {
    if (ctx.replyWithLivePhoto) return await ctx.replyWithLivePhoto(source, ex);
    if (ctx.api && ctx.chat) return await ctx.api.sendLivePhoto(ctx.chat.id, source, ex);
  } catch {  }
  return undefined;
}

export interface TelegramFile {
  kind: string;
  file_id: string;
  file_size: number;
}

export interface TelegramMessage {
  platform: "telegram";
  chatId: string;
  userId: string;
  username: string;
  text: string;
  messageId: number | null;
  files: TelegramFile[];
  raw: unknown;
  reply: (text: unknown, extra?: any) => Promise<unknown>;
  video: (source: unknown, extra?: Record<string, unknown>) => Promise<unknown>;
  react: (emoji?: string) => Promise<unknown>;
  download: (fileId?: string) => Promise<Buffer>;
}

export function readMsg(ctx: any): TelegramMessage {
  const msg = ctx.message || ctx.msg || {};
  const from = ctx.from || {};
  const chat = ctx.chat || {};
  const files: TelegramFile[] = [];
  const grab = (f: any, kind: string) => {
    if (f && f.file_id) files.push({ kind, file_id: f.file_id, file_size: f.file_size || 0 });
  };
  if (msg.photo && msg.photo.length) grab(msg.photo[msg.photo.length - 1], "photo");
  if (msg.video) grab(msg.video, "video");
  if (msg.audio) grab(msg.audio, "audio");
  if (msg.voice) grab(msg.voice, "voice");
  if (msg.document) grab(msg.document, "document");
  if (msg.sticker) grab(msg.sticker, "sticker");
  if (msg.animation) grab(msg.animation, "animation");
  return {
    platform: "telegram",
    chatId: String(chat.id || ""),
    userId: String(from.id || ""),
    username: from.username || [from.first_name, from.last_name].filter(Boolean).join(" ") || "User",
    text: String(msg.text || msg.caption || ""),
    messageId: msg.message_id || null,
    files,
    raw: ctx,
    reply: (text, extra) => ctx.reply(text, extra),
    video: (source, extra) => sendVideo(ctx, source, extra),
    react: (emoji) => sendReact(ctx, emoji),
    download: (fileId) => fetchFile(ctx, fileId || (files[0] && files[0].file_id))
  };
}

export function mediaFile(data: unknown, filename?: string): unknown {
  try {
    return new (engine().InputFile)(data, filename);
  } catch {
    throw new Error("grammy InputFile is not available");
  }
}

export function isConflict(err: unknown): boolean {
  try {
    const inner = (err as any)?.error ? (err as any).error : err;
    const G = engine().GrammyError;
    if (G && inner instanceof G && inner.error_code === 409) return true;
  } catch {  }
  const msg = String(((err as any)?.error?.message) || (err as any)?.message || err || "");
  return /409|Conflict|terminated by other getUpdates/.test(msg);
}

export interface ClassifiedError {
  kind: string;
  message: string;
  updateType: string;
  error: unknown;
}

export function classifyError(err: any): ClassifiedError {
  const inner = err && err.error ? err.error : err;
  let kind = "unknown";
  try {
    const G = engine();
    if (G.GrammyError && inner instanceof G.GrammyError) kind = "grammy";
    else if (G.HttpError && inner instanceof G.HttpError) kind = "http";
  } catch {  }
  return {
    kind,
    message: String((inner && inner.description) || (inner && inner.message) || inner || ""),
    updateType: err && err.ctx ? err.ctx.updateType || (err.ctx.update && err.ctx.update.message ? "message" : "unknown") : "unknown",
    error: inner
  };
}

export function cls(name: string): unknown {
  try {
    return engine()[name] || null;
  } catch {
    return null;
  }
}

export function hydrateFiles(): unknown {
  try {
    return need("@grammyjs/files").hydrateFiles || null;
  } catch {
    return null;
  }
}

export async function sendVote(api: any, chatId: string | number, question: string, options: string[], extra?: Record<string, unknown>): Promise<unknown> {
  const opts = options.map((s) => String(s).slice(0, 100)).filter(Boolean).slice(0, 10);
  if (!question || opts.length < 2) throw new Error("Poll needs a question and at least 2 options.");
  return api.sendPoll(chatId, String(question).slice(0, 300), opts, Object.assign({ is_anonymous: false }, extra || {}));
}

import { Bot, Api, Composer, session, InlineKeyboard, Keyboard, InputMediaBuilder, InputFile, GrammyError, HttpError, BotError } from "grammy";

export { Bot, Api, Composer, session, InlineKeyboard, Keyboard, InputMediaBuilder, InputFile, GrammyError, HttpError, BotError };
