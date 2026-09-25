import { Cooldown, SpamDetection } from "./common/cooldown.js";
import { sticker as convertSticker } from "./common/converter.js";
import { need } from "./loader.js";
import crypto from "node:crypto";

export { Cooldown, SpamDetection };

export function baileys(): any {
  try {
    return need("baileys");
  } catch {
    return need("@whiskeysockets/baileys");
  }
}

export async function send(sock: any, chat: string, content: unknown, quoted?: unknown): Promise<unknown> {
  return sock.sendMessage(chat, content, quoted ? { quoted } : {});
}

export async function forward(sock: any, chat: string, msg: unknown, force = true, options?: Record<string, unknown>): Promise<unknown> {
  return sock.sendMessage(chat, Object.assign({ forward: msg, forceForward: force !== false }, options || {}));
}

export async function reply(sock: any, chat: string, text: unknown, quoted?: unknown): Promise<unknown> {
  return send(sock, chat, { text: String(text == null ? "" : text) }, quoted);
}

export interface SendContext {
  quoted?: unknown;
  forward?: unknown;
  forceForward?: boolean;
  mentions?: string[];
}

export async function sendWithContext(sock: any, chat: string, content: unknown, ctx: SendContext = {}): Promise<unknown> {
  if (ctx.forward) {
    return sock.sendMessage(chat, { forward: ctx.forward, forceForward: ctx.forceForward !== false });
  }
  const text = typeof content === "string" ? { text: content } : ((content || {}) as Record<string, unknown>);
  if (ctx.mentions && ctx.mentions.length && text && typeof text === "object") {
    (text as Record<string, unknown>).contextInfo = Object.assign({}, (text as Record<string, unknown>).contextInfo, { mentionedJid: ctx.mentions });
  }
  return send(sock, chat, text, ctx.quoted);
}

export async function poll(sock: any, chat: string, question: string, options: string[], quoted?: unknown): Promise<unknown> {
  const values = (options || []).map((s) => String(s).slice(0, 100)).filter(Boolean).slice(0, 12);
  if (!question || values.length < 2) throw new Error("Poll needs a question and at least 2 options.");
  return send(sock, chat, { poll: { name: String(question).slice(0, 300), values, selectableCount: 1 } }, quoted);
}

export interface AdReplyOptions {
  title?: string;
  body?: string;
  url?: string;
  thumbnailUrl?: string;
  thumbnail?: Buffer;
  mediaType?: number;
  largeThumb?: boolean;
  showAd?: boolean;
}

export function adReply(opts: AdReplyOptions = {}): Record<string, unknown> {
  return {
    showAdAttribution: opts.showAd !== false,
    title: opts.title || "",
    body: opts.body || null,
    sourceUrl: opts.url || "",
    mediaType: opts.mediaType || 1,
    renderLargerThumbnail: !!opts.largeThumb,
    thumbnailUrl: opts.thumbnailUrl,
    thumbnail: opts.thumbnail
  };
}

export async function sendAd(sock: any, chat: string, text: unknown, ad: AdReplyOptions, quoted?: unknown): Promise<unknown> {
  return send(
    sock,
    chat,
    {
      text: String(text == null ? "" : text),
      contextInfo: { externalAdReply: adReply(ad) }
    },
    quoted
  );
}

export type MediaKind = "image" | "video" | "audio" | "document";

export function kindOf(name: unknown): MediaKind {
  const ext = String(name || "").split(".").pop()?.toLowerCase().split("?")[0] || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "mkv", "webm", "3gp"].includes(ext)) return "video";
  if (["mp3", "ogg", "oga", "wav", "m4a", "opus"].includes(ext)) return "audio";
  return "document";
}

export async function file(sock: any, chat: string, src: unknown, filename?: string, caption?: string, quoted?: unknown): Promise<unknown> {
  const name = filename || "file";
  const kind = kindOf(typeof src === "string" && /^https?:\/\//.test(src) ? src : name);
  const content: Record<string, unknown> = {};
  if (typeof src === "string" && /^https?:\/\//.test(src)) content[kind] = { url: src };
  else content[kind] = src;
  if (kind === "audio" && !content.mimetype) content.mimetype = "audio/mpeg";
  if (caption) content.caption = String(caption).slice(0, 1000);
  if (kind === "document") content.fileName = name;
  return send(sock, chat, content, quoted);
}

export interface StickerOptions {
  raw?: boolean;
  packname?: string;
  author?: string;
}

export async function sticker(sock: any, chat: string, buf: Buffer, quoted?: unknown, opts: StickerOptions = {}): Promise<unknown> {
  let out: unknown = buf;
  if (!opts.raw) {
    out = await convertSticker(buf, { packname: opts.packname, author: opts.author });
  }
  if (!out) throw new Error("Sticker conversion failed.");
  return send(sock, chat, { sticker: out }, quoted);
}

export async function react(sock: any, chat: string, key: unknown, emoji?: string): Promise<unknown> {
  return send(sock, chat, { react: { text: String(emoji || "").slice(0, 8), key } }, undefined);
}

export interface QuickButton {
  id: string;
  text: string;
}
export interface UrlButton {
  url: string;
  text: string;
}
export interface CopyButton {
  copy: string;
  text: string;
}
export interface CallButton {
  call: string;
  text: string;
}
export interface ListSection {
  title: string;
  rows: unknown[];
}
export type ButtonInput = QuickButton | UrlButton | CopyButton | CallButton | ListSection | [string, string] | Record<string, unknown>;

export function quick(id: string | number, label: string): QuickButton {
  return { id: String(id), text: String(label) };
}

export function url(link: string, label: string): UrlButton {
  return { url: String(link), text: String(label) };
}

export function copy(code: string, label: string): CopyButton {
  return { copy: String(code), text: String(label) };
}

export function call(number: string | number, label: string): CallButton {
  return { call: String(number), text: String(label) };
}

export function section(title: string, rows: unknown[]): ListSection {
  return {
    title: String(title),
    rows: (rows || []).map((r) =>
      Array.isArray(r) ? { id: String(r[0]), title: String(r[1]), description: r[2] ? String(r[2]) : "" } : r
    )
  };
}

export function menu(label: string, sections: unknown[]): { text: string; sections: unknown[] } {
  return { text: String(label), sections: sections || [] };
}

export interface NativeFlowButton {
  name: string;
  buttonParamsJson: string;
}

function normRow(r: unknown): { id: string; title: string; description?: string } {
  if (Array.isArray(r)) return { id: String(r[0]), title: String(r[1] || r[0]), description: r[2] ? String(r[2]) : undefined };
  const o = r as Record<string, unknown>;
  return { id: String(o.id || ""), title: String(o.title || o.id || ""), description: o.description ? String(o.description) : undefined };
}

export function normInteractive(b: ButtonInput): NativeFlowButton {
  let btn: Record<string, any> = Array.isArray(b) ? { id: String(b[0]), text: String(b[1]) } : { ...((b || {}) as Record<string, unknown>) };
  if (btn.name && btn.buttonParamsJson) {
    return { name: btn.name, buttonParamsJson: typeof btn.buttonParamsJson === "string" ? btn.buttonParamsJson : JSON.stringify(btn.buttonParamsJson) };
  }
  const label = String(btn.text || btn.label || btn.title || "");
  if (btn.sections) return { name: "single_select", buttonParamsJson: JSON.stringify({ title: label || "Menu", sections: btn.sections }) };
  if (btn.rows) {
    return {
      name: "single_select",
      buttonParamsJson: JSON.stringify({ title: label || "Menu", sections: [{ title: label || "Menu", rows: (btn.rows as unknown[]).map(normRow) }] })
    };
  }
  if (btn.url) return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: label, url: String(btn.url) }) };
  if (btn.copy) return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: label, copy_code: String(btn.copy) }) };
  if (btn.call) return { name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: label, phone_number: String(btn.call).replace(/\D/g, "") }) };
  return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: label, id: String(btn.id || label) }) };
}

export interface ButtonMedia {
  image?: unknown;
  video?: unknown;
  gif?: boolean;
  title?: string;
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number; lon?: number };
}

async function mediaHeader(sock: any, media: ButtonMedia): Promise<Record<string, unknown>> {
  if (media.location) {
    const loc = media.location;
    return {
      title: String(media.title || ""),
      locationMessage: { degreesLatitude: Number(loc.lat ?? loc.latitude), degreesLongitude: Number(loc.lng ?? loc.lon ?? loc.longitude) },
      hasMediaAttachment: false
    };
  }
  const B = baileys();
  let src: unknown = media.image || media.video;
  if (typeof src === "string" && /^https?:\/\//.test(src)) src = { url: src };
  if (!src) throw new Error("media needs { image } or { video }.");
  if (typeof sock.waUploadToServer !== "function") throw new Error("socket cannot upload media.");
  if (typeof B.prepareWAMessageMedia !== "function") throw new Error("baileys cannot prepare media.");
  const kind = media.video ? "video" : "image";
  const up = await B.prepareWAMessageMedia({ [kind]: src }, { upload: (...a: unknown[]) => (sock.waUploadToServer as (...a: unknown[]) => unknown)(...a) });
  const msgKey = kind + "Message";
  const inner = (up && up[msgKey]) || {};
  if (media.video && media.gif) inner.gifPlayback = true;
  const header: Record<string, unknown> = { title: String(media.title || ""), hasMediaAttachment: true };
  header[msgKey] = inner;
  return header;
}

function loadHelper(): any {
  try {
    return need("baileys_helper");
  } catch {
    return null;
  }
}

export interface SentKey {
  key: { remoteJid: string; fromMe: boolean; id: string };
}

function sentKey(chat: string, sent: any, fallbackId?: string): SentKey {
  const id = (sent && sent.key && sent.key.id) || (typeof sent === "string" ? sent : fallbackId) || "";
  return { key: { remoteJid: chat, fromMe: true, id: String(id) } };
}

export async function buttons(sock: any, chat: string, text: unknown, list: ButtonInput[], footer?: string | null, quoted?: any, media?: ButtonMedia | null, flow?: { messageParamsJson?: string }): Promise<SentKey> {
  const btns = (list || []).map(normInteractive).filter(Boolean).slice(0, 10);
  if (!btns.length) throw new Error("buttons needs at least 1 button.");
  const interactive: Record<string, unknown> = {
    body: { text: String(text == null ? "" : text) },
    nativeFlowMessage: { buttons: btns, ...(flow && flow.messageParamsJson ? { messageParamsJson: flow.messageParamsJson } : {}) }
  };
  if (footer) interactive.footer = { text: String(footer) };
  if (media) interactive.header = await mediaHeader(sock, media);
  const options = quoted && quoted.key ? { quoted } : {};
  const helper = loadHelper();
  if (helper && helper.sendInteractiveMessage) {
    const sent = await helper.sendInteractiveMessage(sock, chat, { interactiveMessage: interactive }, options);
    return sentKey(chat, sent);
  }
  if (quoted && quoted.key) {
    interactive.contextInfo = { stanzaId: quoted.key.id, participant: quoted.key.participant || quoted.key.remoteJid };
    if (quoted.message) (interactive.contextInfo as Record<string, unknown>).quotedMessage = quoted.message;
  }
  const B = baileys();
  const messageId = B.generateMessageID ? B.generateMessageID() : "3EB0" + Math.random().toString(16).slice(2, 10).toUpperCase();
  const sent = await sock.relayMessage(chat, { interactiveMessage: interactive }, { messageId });
  return sentKey(chat, sent, messageId);
}

export async function flow(sock: any, chat: string, text: unknown, list: ButtonInput[], footer?: string | null, quoted?: any, media?: ButtonMedia | null): Promise<unknown> {
  return buttons(sock, chat, text, list, footer, quoted, media);
}

export interface IAMessageOptions {
  content?: unknown;
  footer?: string;
  header?: string;
  media?: unknown;
  gif?: boolean;
}

export async function sendIAMessage(sock: any, chat: string, list: ButtonInput[], quoted?: any, opts: IAMessageOptions = {}): Promise<unknown> {
  let media: ButtonMedia | null = null;
  if (opts.media) {
    const src = opts.media;
    const isVideo = /\.(mp4|mov|webm|mkv|gif)(\?|#|$)/i.test(typeof src === "string" ? src : (src as { filename?: string }).filename || "");
    media = isVideo ? { video: src, title: opts.header, gif: !!opts.gif } : { image: src, title: opts.header };
  }
  return buttons(sock, chat, opts.content, list, opts.footer, quoted, media);
}

const WRAPPERS = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage", "editedMessage", "associatedChildMessage", "groupStatusMessage", "groupStatusMessageV2"];

export function normalizeContent(content: unknown): any {
  try {
    const B = baileys();
    if (B && typeof B.normalizeMessageContent === "function") return B.normalizeMessageContent(content);
  } catch {}
  let cur: any = content;
  for (let i = 0; i < 5 && cur; i++) {
    const next = cur.ephemeralMessage || cur.viewOnceMessage || cur.viewOnceMessageV2 || cur.viewOnceMessageV2Extension || cur.documentWithCaptionMessage || cur.editedMessage || cur.associatedChildMessage || cur.groupStatusMessage || cur.groupStatusMessageV2;
    if (!next || !next.message) break;
    cur = next.message;
  }
  return cur;
}

function pickParam(params: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export function tap(m: any): string | null {
  const raw = (m && m.message) || m || {};
  const msg = normalizeContent(raw) || {};
  if (msg.buttonsResponseMessage) return msg.buttonsResponseMessage.selectedButtonId || null;
  if (msg.templateButtonReplyMessage) return msg.templateButtonReplyMessage.selectedId || null;
  if (msg.listResponseMessage && msg.listResponseMessage.singleSelectReply) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId || null;
  }
  const ir = msg.interactiveResponseMessage;
  const flow = ir && ir.nativeFlowResponseMessage;
  if (flow && typeof flow.paramsJson === "string" && flow.paramsJson) {
    const name = String(flow.name || "");
    if (name && name !== "quick_reply" && name !== "single_select" && name !== "button_click" && name !== "list_select") return null;
    try {
      const p = JSON.parse(flow.paramsJson) as Record<string, unknown>;
      return pickParam(p, ["id", "button_id", "row_id"]);
    } catch {
      return null;
    }
  }
  return null;
}

export function mention(text: unknown): string[] {
  const out: string[] = [];
  const re = /@(\d{8,16})/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(String(text || "")))) {
    const jid = m[1] + "@s.whatsapp.net";
    if (!out.includes(jid)) out.push(jid);
  }
  return out;
}

export interface ForwardInfo {
  forwarded: boolean;
  score: number;
}

export function forwardInfo(msg: any): ForwardInfo {
  const m = (msg && msg.message) || msg || {};
  if (typeof m.isForwarded === "boolean") {
    return { forwarded: m.isForwarded, score: Number(m.forwardScore) || 0 };
  }
  const pools: unknown[] = [m.msg && (m.msg as Record<string, unknown>).contextInfo, m.contextInfo];
  if (m.message && typeof m.message === "object") {
    for (const k of Object.keys(m.message)) {
      const inner = (m.message as Record<string, unknown>)[k];
      if (inner && typeof inner === "object") pools.push((inner as Record<string, unknown>).contextInfo);
    }
  } else if (m && typeof m === "object") {
    for (const k of Object.keys(m)) {
      if (k === "contextInfo" || k === "msg" || k === "message") continue;
      const inner = (m as Record<string, unknown>)[k];
      if (inner && typeof inner === "object") pools.push((inner as Record<string, unknown>).contextInfo);
    }
  }
  for (const info of pools) {
    const o = (info || {}) as Record<string, unknown>;
    const score = Number(o.forwardingScore) || 0;
    if (o.isForwarded === true || score > 0) return { forwarded: true, score };
  }
  return { forwarded: false, score: 0 };
}

export function tallyPoll(pollCreation: unknown, pollUpdates: unknown[]): unknown {
  const B = baileys();
  if (typeof B.getAggregateVotesInPollMessage !== "function") throw new Error("Baileys cannot aggregate poll votes.");
  return B.getAggregateVotesInPollMessage({ message: pollCreation, pollUpdates });
}

export type PresenceAction = "composing" | "recording" | "paused" | "available" | "unavailable";

export async function typing(sock: any, chat: string, action: PresenceAction = "composing", ms?: number): Promise<unknown> {
  await sock.sendPresenceUpdate(action, chat);
  if (ms && ms > 0 && (action === "composing" || action === "recording")) {
    await new Promise((r) => setTimeout(r, ms));
    await sock.sendPresenceUpdate("paused", chat).catch(() => {});
  }
  return true;
}

export interface BroadcastResult {
  jid: string;
  ok: boolean;
  error?: unknown;
}

export async function broadcast(
  sock: any,
  jids: string[],
  content: (jid: string) => unknown,
  gapMs = 1500
): Promise<BroadcastResult[]> {
  const out: BroadcastResult[] = [];
  for (const jid of jids || []) {
    try {
      const built = typeof content === "function" ? await content(jid) : content;
      await sock.sendMessage(jid, built);
      out.push({ jid, ok: true });
    } catch (e) {
      out.push({ jid, ok: false, error: (e as Error)?.message || e });
    }
    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
  }
  return out;
}

export type GroupAdminAction = "promote" | "demote" | "add" | "remove";

export async function groupAdmin(sock: any, chat: string, action: GroupAdminAction, users: string | string[]): Promise<unknown> {
  const list = (Array.isArray(users) ? users : [users]).map(String).filter(Boolean);
  if (!list.length) throw new Error("groupAdmin needs at least 1 user.");
  return sock.groupParticipantsUpdate(chat, list, action);
}

export async function groupApprove(sock: any, chat: string, users: string | string[], approve = true): Promise<unknown> {
  const list = (Array.isArray(users) ? users : [users]).map(String).filter(Boolean);
  if (!list.length) throw new Error("groupApprove needs at least 1 user.");
  if (typeof sock.groupRequestParticipantsUpdate === "function") {
    return sock.groupRequestParticipantsUpdate(chat, list, approve ? "approve" : "reject");
  }
  return sock.groupParticipantsUpdate(chat, list, approve ? "add" : "remove");
}

export function watchPoll(sock: any, getCreation: (key: any) => Promise<unknown>, fn: (key: any, tally: unknown, updates: unknown[]) => void): void {
  sock.ev.on("messages.update", async (events: any[]) => {
    for (const { key, update } of events || []) {
      if (!update || !update.pollUpdates) continue;
      try {
        const creation = await getCreation(key);
        if (!creation) continue;
        fn(key, tallyPoll(creation, update.pollUpdates), update.pollUpdates);
      } catch {}
    }
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function download(mediaMsg: unknown, kind: string, sock?: any, fullMsg?: unknown): Promise<Buffer> {
  const B = baileys();
  try {
    if (B && typeof B.downloadMediaMessage === "function") {
      const target = fullMsg || mediaMsg;
      if (target && typeof target === "object" && (target as Record<string, unknown>).message) {
        let ctx: Record<string, unknown> | undefined = undefined;
        if (sock && typeof sock.updateMediaMessage === "function") {
          const fn = sock.updateMediaMessage.bind(sock);
          ctx = { reuploadRequest: fn };
        }
        const out = ctx ? await B.downloadMediaMessage(target, "buffer", {}, ctx) : await B.downloadMediaMessage(target, "buffer", {});
        if (out) return Buffer.isBuffer(out) ? out : Buffer.from(out as Uint8Array);
      }
      if (mediaMsg && typeof mediaMsg === "object" && !(mediaMsg as Record<string, unknown>).message) {
        const inner = mediaMsg as Record<string, unknown>;
        const looksMedia = Object.keys(inner).some((k) => k.toLowerCase().endsWith("message"));
        if (looksMedia) {
          let ctx2: Record<string, unknown> | undefined = undefined;
          if (sock && typeof sock.updateMediaMessage === "function") {
            const fn2 = sock.updateMediaMessage.bind(sock);
            ctx2 = { reuploadRequest: fn2 };
          }
          const wrapped = { message: mediaMsg };
          const out2 = ctx2 ? await B.downloadMediaMessage(wrapped, "buffer", {}, ctx2) : await B.downloadMediaMessage(wrapped, "buffer", {});
          if (out2) return Buffer.isBuffer(out2) ? out2 : Buffer.from(out2 as Uint8Array);
        }
      }
    }
  } catch {}
  const { downloadContentFromMessage: dl } = B;
  const stream = await dl(mediaMsg, kind);
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk as Buffer]);
  return buf;
}

export async function media(sock: any, chat: string, buf: Buffer, kind: string, quoted?: unknown, extra?: Record<string, unknown>): Promise<unknown> {
  const content: Record<string, unknown> = { ...(extra || {}) };
  if (kind === "audio") {
    content.audio = buf;
    if (!content.mimetype) content.mimetype = "audio/mpeg";
    if (content.ptt === undefined) content.ptt = true;
  } else {
    content[kind] = buf;
  }
  return send(sock, chat, content, quoted);
}

export async function rejectCall(sock: any, callId: string, callFrom: string): Promise<unknown> {
  return sock.rejectCall(callId, callFrom);
}

export interface HtmlOptions {
  id?: string;
  title?: string;
  html?: string;
  source?: string;
  quoted?: any;
  botJid?: string;
}

export function richContextInfo(quoted?: any, botJid?: string): Record<string, unknown> {
  const contextInfo: Record<string, unknown> = {};
  if (quoted && quoted.key) {
    contextInfo.stanzaId = quoted.key.id;
    contextInfo.participant = quoted.key.participant || quoted.key.remoteJid;
    if (quoted.message) contextInfo.quotedMessage = quoted.message;
  }
  contextInfo.forwardingScore = 2;
  contextInfo.isForwarded = true;
  contextInfo.forwardedAiBotMessageInfo = { botJid: botJid || "259786046210223@bot" };
  contextInfo.forwardOrigin = 4;
  contextInfo.botMessageSharingInfo = { botEntryPointOrigin: 1, forwardScore: 2 };
  return contextInfo;
}

export function richMessageContext(responseId: string, disclaimerText?: string): Record<string, unknown> {
  return {
    threadId: [],
    deviceListMetadata: {
      senderKeyIndexes: [],
      recipientKeyIndexes: [],
      recipientKeyHash: "",
      recipientTimestamp: Math.floor(Date.now() / 1000)
    },
    deviceListMetadataVersion: 2,
    messageSecret: crypto.randomBytes(32),
    botMetadata: { messageDisclaimerText: String(disclaimerText || ""), botResponseId: responseId }
  };
}

export function richMessageId(): string {
  try {
    const B = baileys();
    if (typeof B.generateMessageIDV2 === "function") return B.generateMessageIDV2();
    if (typeof B.generateMessageID === "function") return B.generateMessageID();
  } catch {}
  return "3EB0" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

export async function sendHtml(sock: any, chat: string, opts: HtmlOptions = {}): Promise<SentKey> {
  const id = String(opts.id || "html");
  const responseId = `${id}-${Date.now()}`;
  const payload = {
    response_id: responseId,
    sections: [
      {
        view_model: {
          primitive: { __typename: "GenAIaeacdsnwHtmlPrimitive", payload: String(opts.html || ""), trusted_sources: [opts.source || "sdk"] },
          __typename: "GenAISingleLayoutViewModel"
        }
      }
    ]
  };
  const contextInfo = richContextInfo(opts.quoted, opts.botJid);
  const sent = await sock.relayMessage(
    chat,
    {
      messageContextInfo: richMessageContext(responseId),
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [{ messageType: 2, messageText: String(opts.title || "") }],
            unifiedResponse: { data: Buffer.from(JSON.stringify(payload)).toString("base64") },
            contextInfo
          }
        }
      }
    },
    {}
  );
  return sentKey(chat, sent);
}

export type RichBlock =
  | { text: string }
  | { language: string; code: { highlightType: number; codeContent: string }[] | string }
  | { title?: string; table: { isHeading?: boolean; items: string[] }[] | { headers: string[]; rows: string[][] } };

export interface RichOptions {
  disclaimerText?: string;
  quoted?: any;
}

function richCodeBlocks(code: { highlightType: number; codeContent: string }[] | string): { content: string; type: string }[] {
  if (typeof code === "string") return [{ content: code, type: "DEFAULT" }];
  return code.map((t) => ({ content: String(t.codeContent ?? ""), type: "DEFAULT" }));
}

function richTableRows(table: { isHeading?: boolean; items: string[] }[] | { headers: string[]; rows: string[][] }): { is_header?: boolean; cells: string[] }[] {
  if (Array.isArray(table)) {
    return table.map((r) => ({ ...(r.isHeading ? { is_header: true } : {}), cells: r.items.map(String) }));
  }
  const headers = table.headers.map(String);
  const width = Math.max(headers.length, ...table.rows.map((r) => r.length));
  const pad = (cells: string[]) => [...cells.map(String), ...Array(Math.max(0, width - cells.length)).fill("")];
  return [{ is_header: true, cells: pad(headers) }, ...table.rows.map((cells) => ({ cells: pad(cells) }))];
}

export async function sendRichResponse(sock: any, chat: string, blocks: RichBlock[], opts: RichOptions = {}): Promise<SentKey> {
  const list = (Array.isArray(blocks) ? blocks : [blocks]).filter(Boolean);
  if (!list.length) throw new Error("sendRichResponse needs at least 1 block.");
  const submessages: Record<string, unknown>[] = [];
  const sections: Record<string, unknown>[] = [];
  const md = (text: string) => ({ view_model: { primitive: { text, __typename: "GenAIMarkdownTextUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } });
  for (const b of list) {
    if ("text" in b && !("table" in b) && !("code" in b)) {
      submessages.push({ messageType: 2, messageText: b.text });
      sections.push(md(b.text));
    } else if ("code" in b) {
      const language = (b as { language?: string }).language || "javascript";
      const blocks = richCodeBlocks((b as { code: { highlightType: number; codeContent: string }[] | string }).code);
      submessages.push({ messageType: 2, messageText: blocks.map((x) => x.content).join("") });
      sections.push({ view_model: { primitive: { language, code_blocks: blocks, __typename: "GenAICodeUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } });
    } else if ("table" in b) {
      const rows = richTableRows((b as { table: { isHeading?: boolean; items: string[] }[] | { headers: string[]; rows: string[][] } }).table);
      const title = (b as { title?: string }).title || "";
      if (title) submessages.push({ messageType: 2, messageText: title });
      sections.push({ view_model: { primitive: { rows, __typename: "GenATableUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } });
    }
  }
  const responseId = crypto.randomUUID();
  const contextInfo = richContextInfo(opts.quoted);
  const sent = await sock.relayMessage(
    chat,
    {
      messageContextInfo: richMessageContext(responseId, opts.disclaimerText),
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages,
            unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: responseId, sections })).toString("base64") },
            contextInfo
          }
        }
      }
    },
    {}
  );
  return sentKey(chat, sent);
}

export function watchCalls(sock: any, fn: (call: any) => void): void {
  sock.ev.on("call", (calls: any[]) => {
    for (const c of calls || []) {
      if (c.status === "offer") fn(c);
    }
  });
}

export type MetaBlock =
  | { text: string }
  | { code: string; language?: string }
  | { table: { title?: string; headers: string[]; rows: string[][] } };

export interface MetaOptions {
  title?: string;
  footer?: string;
  quoted?: any;
}

function metaTableRows(headers: string[], rows: string[][]): { is_header?: boolean; cells: string[] }[] {
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")];
  return [{ is_header: true, cells: pad(headers) }, ...rows.map((cells) => ({ cells: pad(cells) }))];
}

function metaSection(block: MetaBlock): Record<string, unknown> {
  if ("text" in block) {
    return { view_model: { primitive: { text: block.text, __typename: "GenAIMarkdownTextUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } };
  }
  if ("code" in block) {
    return {
      view_model: {
        primitive: {
          language: block.language || "javascript",
          code_blocks: [{ content: block.code, type: "DEFAULT" }],
          __typename: "GenAICodeUXPrimitive"
        },
        __typename: "GenAISingleLayoutViewModel"
      }
    };
  }
  return {
    view_model: {
      primitive: { rows: metaTableRows(block.table.headers, block.table.rows), __typename: "GenATableUXPrimitive" },
      __typename: "GenAISingleLayoutViewModel"
    }
  };
}

export async function sendMetaMsg(sock: any, chat: string, blocks: MetaBlock[], opts: MetaOptions = {}): Promise<SentKey> {
  const list = (Array.isArray(blocks) ? blocks : [blocks]).filter(Boolean);
  if (!list.length) throw new Error("sendMetaMsg needs at least 1 block.");
  const sections: Record<string, unknown>[] = [];
  if (opts.title) {
    sections.push({ view_model: { primitive: { text: opts.title, __typename: "GenAIMarkdownTextUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } });
  }
  for (const b of list) sections.push(metaSection(b));
  if (opts.footer) {
    sections.push({ view_model: { primitive: { text: opts.footer, __typename: "GenAIMarkdownTextUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } });
  }
  const responseId = crypto.randomUUID();
  const contextInfo = richContextInfo(opts.quoted);
  const sent = await sock.relayMessage(
    chat,
    {
      messageContextInfo: richMessageContext(responseId),
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [],
            unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: responseId, sections })).toString("base64") },
            contextInfo
          }
        }
      }
    },
    {}
  );
  return sentKey(chat, sent);
}

export interface CarouselCard {
  image?: unknown;
  video?: unknown;
  title?: string;
  body?: string;
  footer?: string;
  buttons?: ButtonInput[];
}

export interface CarouselOptions {
  text?: string;
  title?: string;
  footer?: string;
  quoted?: any;
}

export async function deleteMessage(sock: any, chat: string, keyOrId: unknown): Promise<unknown> {
  const key = typeof keyOrId === "string" ? { remoteJid: chat, fromMe: true, id: keyOrId } : keyOrId;
  return sock.sendMessage(chat, { delete: key });
}

function bizNodes(privateChat: boolean): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }]
        }
      ]
    }
  ];
  if (privateChat) nodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodes;
}

async function carouselHeader(sock: any, card: CarouselCard): Promise<Record<string, unknown>> {
  const B = baileys();
  const src = card.image || card.video;
  if (!src) return { title: String(card.title || ""), hasMediaAttachment: false };
  let media: unknown = src;
  if (typeof src === "string" && /^https?:\/\//.test(src)) media = { url: src };
  if (typeof sock.waUploadToServer !== "function" || typeof B.prepareWAMessageMedia !== "function") {
    return { title: String(card.title || ""), hasMediaAttachment: false };
  }
  const kind = card.video ? "video" : "image";
  const up = await B.prepareWAMessageMedia({ [kind]: media }, { upload: (...a: unknown[]) => (sock.waUploadToServer as (...a: unknown[]) => unknown)(...a) });
  const msgKey = kind + "Message";
  const header: Record<string, unknown> = { title: String(card.title || ""), hasMediaAttachment: true };
  if (up && up[msgKey]) header[msgKey] = up[msgKey];
  return header;
}

export async function carousel(sock: any, chat: string, cards: CarouselCard[], opts: CarouselOptions = {}): Promise<SentKey> {
  const list = (Array.isArray(cards) ? cards : []).filter(Boolean);
  if (!list.length) throw new Error("carousel needs at least 1 card.");
  if (list.length > 10) throw new Error("carousel supports max 10 cards.");
  const slides = [];
  for (const [index, card] of list.entries()) {
    const header = await carouselHeader(sock, card);
    if (!header.hasMediaAttachment) {
      throw new Error(`carousel card ${index} needs an image or video header.`);
    }
    const nativeButtons = (card.buttons || []).map(normInteractive).filter(Boolean).map((b) => ({
      name: b.name,
      buttonParamsJson: typeof b.buttonParamsJson === "string" ? b.buttonParamsJson : JSON.stringify(b.buttonParamsJson || {})
    }));
    slides.push({
      header,
      body: { text: String(card.body || "") },
      footer: { text: String(card.footer || "") },
      nativeFlowMessage: { buttons: nativeButtons, messageParamsJson: "{}" }
    });
  }
  const interactive: Record<string, unknown> = {
    header: { hasMediaAttachment: false },
    carouselMessage: { cards: slides }
  };
  if (opts.text) interactive.body = { text: String(opts.text) };
  if (opts.title) interactive.header = { title: String(opts.title), hasMediaAttachment: false };
  if (opts.footer) interactive.footer = { text: String(opts.footer) };
  const B = baileys();
  const generate = B.generateWAMessageFromContent;
  const fullMsg = typeof generate === "function"
    ? generate(chat, { interactiveMessage: interactive }, opts.quoted && opts.quoted.key ? { quoted: opts.quoted } : {})
    : null;
  const message = fullMsg && fullMsg.message ? fullMsg.message : { interactiveMessage: interactive };
  const messageId = (fullMsg && fullMsg.key && fullMsg.key.id) || (B.generateMessageID ? B.generateMessageID() : "3EB0" + Math.random().toString(16).slice(2, 10).toUpperCase());
  const privateChat = !String(chat || "").endsWith("@g.us");
  const sent = await sock.relayMessage(chat, message, { messageId, additionalNodes: bizNodes(privateChat) });
  return sentKey(chat, sent, messageId);
}

export async function groupInvite(
  sock: any,
  participant: string,
  groupJid: string,
  inviteCode: string,
  inviteTtl?: number | string,
  groupName?: string,
  caption?: string
): Promise<unknown> {
  const B = baileys();
  const name = groupName || (await sock.getName(groupJid).catch(() => "unknown subject"));
  const protoMsg = B.proto && B.proto.Message ? B.proto.Message : null;
  const build = protoMsg && typeof protoMsg.create === "function" ? protoMsg.create.bind(protoMsg) : protoMsg.fromObject.bind(protoMsg);
  const msg = build({
    groupInviteMessage: {
      inviteCode,
      inviteTtl: parseInt(String(inviteTtl)) || Date.now() + 259200000,
      groupJid,
      groupName: name,
      caption: caption || "Invitation to join my WhatsApp group"
    }
  });
  const messageId = B.generateMessageID ? B.generateMessageID() : "3EB0" + Math.random().toString(16).slice(2, 10).toUpperCase();
  return sock.relayMessage(participant, msg, { messageId });
}

export async function newsletterQuery(sock: any, type: string, jid: string): Promise<unknown> {
  try {
    if (sock && typeof sock.newsletterMetadata === "function") {
      const out = await sock.newsletterMetadata(type, jid);
      if (out !== null && out !== undefined) return out;
    }
  } catch {}
  return sock
    .query({
      tag: "xmpp",
      attrs: {},
      content: [{ tag: "query", attrs: { jid, type } }]
    })
    .catch(() => null);
}

export async function markRead(sock: any, ...keys: any[]): Promise<unknown> {
  const flat: any[] = [];
  for (const k of keys || []) {
    if (Array.isArray(k)) {
      for (const inner of k) if (inner) flat.push(inner);
    } else if (k) flat.push(k);
  }
  if (!flat.length) return null;
  if (!sock || typeof sock.readMessages !== "function") return null;
  return sock.readMessages(flat);
}

export async function presenceSubscribe(sock: any, jid: string): Promise<unknown> {
  if (!sock || typeof sock.presenceSubscribe !== "function") return null;
  return sock.presenceSubscribe(jid);
}
