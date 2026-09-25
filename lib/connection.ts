import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chokidar from "chokidar";
import syntaxError from "syntax-error";
import qrcode from "qrcode-terminal";
import { serializeM } from "./serialize.js";
import * as WA from "../sdk/whatsapp.js";
import { freshRequire, need, needAsync } from "../sdk/loader.js";

let cachedBaileys: Promise<any> | null = null;

async function baileys(): Promise<any> {
  if (!cachedBaileys) {
    cachedBaileys = (async () => {
      try {
        return need("@whiskeysockets/baileys");
      } catch {
        return needAsync("baileys");
      }
    })();
  }
  return cachedBaileys;
}

function loadConfigFile(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf8"));
  } catch {
    return {};
  }
}

const FORWARD_EVENTS = [
  "messages.update",
  "message-receipt.update",
  "messages.reaction",
  "presence.update",
  "chats.update",
  "contacts.update",
  "groups.update",
  "group-participants.update",
  "group.join-request",
  "blocklist.set",
  "blocklist.update",
  "call"
];

export interface PairingOptions {
  state?: boolean;
  number?: string;
  code?: string;
}

export interface ConnectionOptions {
  plugins_dir?: string;
  session_dir?: string;
  online?: boolean;
  presence?: boolean | Record<string, unknown>;
  pairing?: PairingOptions;
  browser?: unknown;
  version?: unknown;
  syncFullHistory?: boolean;
  prefix?: string;
  bot?: ((id: string) => boolean) | null;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  [key: string]: unknown;
}

export interface ConnectionPlugin {
  run?: (m: any, ctx: any) => Promise<unknown> | unknown;
  command?: string | string[];
  name?: string;
  [key: string]: unknown;
}

export class Connection extends EventEmitter {
  opts: ConnectionOptions;
  extra: Record<string, unknown>;
  config: Record<string, any>;
  prefix: string;
  sock: any = null;
  store: any = null;
  messageCache = new Map<string, unknown>();
  plugins = new Map<string, ConnectionPlugin>();
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private reconnectBaseMs = 1000;
  private reconnectMaxMs = 30000;
  private connecting: Promise<unknown> | null = null;
  private watcher: any = null;

  constructor(opts: ConnectionOptions = {}, extra: Record<string, unknown> = {}) {
    super();
    this.opts = Object.assign(
      {
        plugins_dir: "plugins",
        session_dir: "./session",
        online: false,
        presence: false,
        pairing: { state: false, number: "" },
        browser: null,
        version: null,
        syncFullHistory: false
      },
      opts
    );
    this.extra = extra || {};
    this.config = loadConfigFile();
    this.prefix = (opts.prefix as string) || this.config.prefix || ".";
    if (Number(opts.reconnectBaseMs) > 0) this.reconnectBaseMs = Number(opts.reconnectBaseMs);
    if (Number(opts.reconnectMaxMs) > 0) this.reconnectMaxMs = Number(opts.reconnectMaxMs);
  }

  pluginDir(): string {
    const d = (this.opts.plugins_dir as string) || "plugins";
    return path.isAbsolute(d) ? d : path.join(process.cwd(), d);
  }

  matchCommand(plugin: ConnectionPlugin, command: string): boolean {
    const names = (plugin as any).names || plugin.command || plugin.name || [];
    const list = Array.isArray(names) ? names : [names];
    return list.some((n) => String(n).toLowerCase() === String(command).toLowerCase());
  }

  loadPluginFile(full: string): void {
    try {
      const src = fs.readFileSync(full, "utf8");
      const err = syntaxError(src, full);
      if (err) {
        this.emit("error", { message: "Plugin syntax error " + path.basename(full) + ": " + err.message });
        return;
      }
      const loaded = freshRequire(full) as ConnectionPlugin;
      const pl = ((loaded as any).whatsapp || (loaded as any).wa || loaded) as ConnectionPlugin;
      if (pl && (pl.run || pl.command || (pl as any).names || pl.name)) this.plugins.set(full, pl);
    } catch (e: any) {
      this.emit("error", { message: "Plugin load failed " + path.basename(full) + ": " + ((e && e.message) || e) });
    }
  }

  loadPlugins(): void {
    const dir = this.pluginDir();
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f));
    } catch {
      return;
    }
    for (const f of files) this.loadPluginFile(f);
    try {
      if (!this.watcher) {
        this.watcher = chokidar.watch(dir, { ignoreInitial: true });
        this.watcher.on("add", (f: string) => {
          if (f.endsWith(".js")) this.loadPluginFile(f);
        });
        this.watcher.on("change", (f: string) => {
          if (f.endsWith(".js")) this.loadPluginFile(f);
        });
        this.watcher.on("unlink", (f: string) => this.plugins.delete(f));
      }
    } catch {  }
  }

  parseCommand(text: unknown): { command: string; args: string[] } | null {
    const t = String(text || "");
    if (!t.startsWith(this.prefix)) return null;
    const parts = t.slice(this.prefix.length).trim().split(/\s+/);
    if (!parts[0]) return null;
    return { command: parts[0].toLowerCase(), args: parts.slice(1) };
  }

  async connect(): Promise<unknown> {
    if (this.connecting) return this.connecting;
    this.closed = false;
    this.connecting = this.link().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async link(): Promise<unknown> {
    const B = await baileys();
    const pino = need("pino");
    const sessionDir = this.opts.session_dir;
    let state: any;
    let saveCreds: () => Promise<void>;
    if (typeof sessionDir === "string") {
      const auth = await B.useMultiFileAuthState(sessionDir);
      state = auth.state;
      saveCreds = auth.saveCreds;
    } else if (sessionDir && (sessionDir as any).creds) {
      state = sessionDir;
      saveCreds = (sessionDir as any).saveCreds || (async () => {});
    } else {
      throw new Error("session_dir must be a path string or an auth state object.");
    }
    let version = this.opts.version;
    if (!version) {
      try {
        version = (await B.fetchLatestBaileysVersion()).version;
      } catch {
        version = undefined;
      }
    }
    const cache = (() => {
      try {
        const NodeCache = need("@cacheable/node-cache").NodeCache || need("@cacheable/node-cache");
        return new NodeCache({ stdTTL: 60 });
      } catch {
        return new Map();
      }
    })();
    const groupCache = (() => {
      try {
        const NodeCache = need("@cacheable/node-cache").NodeCache || need("@cacheable/node-cache");
        return new NodeCache({ stdTTL: 300, useClones: false });
      } catch {
        return null;
      }
    })();
    const messageCache = this.messageCache;
    const rememberMessage = (raw: any) => {
      try {
        const id = raw && raw.key && raw.key.id;
        if (!id) return;
        if (!messageCache.has(id) && messageCache.size >= 1000) {
          const first = messageCache.keys().next().value;
          if (first !== undefined) messageCache.delete(first);
        }
        messageCache.set(id, raw);
      } catch {  }
    };
    const sock = B.default(
      Object.assign(
        {
          version,
          logger: pino({ level: "silent" }),
          browser: this.opts.browser || (B.Browsers ? B.Browsers.macOS("Chrome") : ["macOS", "Chrome", "1.0"]),
          auth: {
            creds: state.creds,
            keys: B.makeCacheableSignalKeyStore ? B.makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) : state.keys
          },
          markOnlineOnConnect: !!this.opts.online,
          syncFullHistory: !!this.opts.syncFullHistory,
          msgRetryCounterCache: cache,
          cachedGroupMetadata: groupCache
            ? async (jid: string) => {
                try {
                  const hit = groupCache.get(jid);
                  if (hit) return hit;
                  const meta = await sock.groupMetadata(jid);
                  if (meta) groupCache.set(jid, meta);
                  return meta;
                } catch {
                  return undefined;
                }
              }
            : undefined,
          getMessage: async (key: any) => {
            try {
              const id = key && key.id;
              if (id && messageCache.has(id)) return messageCache.get(id);
              if (this.store && this.store.loadMessage && key && key.remoteJid) {
                return await this.store.loadMessage(key.remoteJid, id).catch(() => undefined);
              }
            } catch {  }
            return undefined;
          }
        },
        this.extra
      )
    );
    this.sock = sock;
    try {
      this.store = B.makeInMemoryStore ? B.makeInMemoryStore({}) : null;
      if (this.store && this.store.bind) this.store.bind(sock.ev);
    } catch {
      this.store = null;
    }
    this.extendSock(sock, B);
    sock.ev.on("creds.update", saveCreds);
    for (const ev of FORWARD_EVENTS) {
      sock.ev.on(ev, (data: unknown) => {
        try {
          this.emit("baileys:" + ev, data);
        } catch {  }
      });
    }
    sock.ev.on("call", (data: unknown) => {
      try {
        this.emit("call", data);
      } catch {  }
    });
    sock.ev.on("connection.update", (update: unknown) => this.onConnectionUpdate(update, B, state));
    sock.ev.on("messages.upsert", ({ messages, type }: any) => {
      for (const raw of messages || []) rememberMessage(raw);
      if (type !== "notify") return;
      for (const raw of messages || [])
        this.handleMessage(raw).catch((e: any) => {
          this.emit("error", { message: "handleMessage: " + ((e && e.message) || e) });
        });
    });
    sock.ev.on("messages.update", (updates: unknown) => {
      try {
        this.emit("messages.update", updates);
      } catch {  }
    });
    sock.ev.on("group-participants.update", (u: any) => this.onGroupParticipants(u));
    sock.ev.on("groups.update", (updates: any[]) => {
      for (const u of updates || []) {
        try {
          if (u && u.id && groupCache) groupCache.set(u.id, u);
        } catch {  }
        this.onGroupsUpdate(u);
      }
    });
    this.loadPlugins();
    this.emit("prepare", { display: "prepare", message: "Session ready, plugins loaded." });
    this.maybePairing(sock, state);
    return sock;
  }

  async maybePairing(sock: any, state: any): Promise<void> {
    const p = (this.opts.pairing || {}) as PairingOptions;
    if (!p.state || (state.creds && state.creds.registered)) return;
    const number = String(p.number || "").replace(/\D/g, "");
    if (!number) {
      this.emit("error", { message: "pairing.state is true but pairing.number is empty." });
      return;
    }
    const waitOpen = () =>
      new Promise<void>((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
          try {
            if (sock.ws && sock.ws.readyState === 1) {
              clearInterval(timer);
              resolve();
            } else if (Date.now() - start > 30000) {
              clearInterval(timer);
              resolve();
            }
          } catch {
            clearInterval(timer);
            resolve();
          }
        }, 500);
      });
    await waitOpen();
    for (let i = 1; i <= 5; i++) {
      try {
        const code = await sock.requestPairingCode(number, p.code || undefined);
        this.emit("prepare", { display: "pairing", message: "Pairing code: " + ((code && code.match(/.{1,4}/g) || [code]).join("-")) });
        return;
      } catch (e: any) {
        if (i === 5) this.emit("error", { message: "Pairing failed: " + ((e && e.message) || e) });
        else await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async onConnectionUpdate(update: any, B: any, _state: unknown): Promise<void> {
    void _state;
    const { connection, lastDisconnect, qr } = update || {};
    if (qr) {
      try {
        qrcode.generate(qr, { small: true });
      } catch {  }
      this.emit("prepare", { display: "qr", message: "Scan the QR code above." });
    }
    if (connection === "open") {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      try {
        if (this.opts.presence && this.sock) await this.sock.sendPresenceUpdate("available");
      } catch {  }
      this.emit("connect", { display: "connect", message: "WhatsApp connected." });
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === (B.DisconnectReason && B.DisconnectReason.loggedOut)) {
        this.emit("error", { message: "Logged out. Delete session_dir and scan again." });
        return;
      }
      if (this.closed) return;
      this.reconnectAttempts += 1;
      const delay = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * 2 ** (this.reconnectAttempts - 1)) + Math.floor(Math.random() * 500);
      this.emit("reconnecting", { display: "reconnecting", message: `Connection closed (${code || "?"}). Retry ${this.reconnectAttempts} in ${delay}ms.` });
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(() => {});
      }, delay);
    }
  }

  onGroupParticipants(u: any): void {
    const map: Record<string, string> = { add: "group.add", remove: "group.remove", promote: "group.promote", demote: "group.demote" };
    const ev = map[u.action];
    if (!ev) return;
    for (const member of u.participants || []) {
      try {
        this.emit(ev, { action: u.action, jid: u.id, author: u.author, member });
      } catch {  }
    }
  }

  onGroupsUpdate(u: any): void {
    const emit = (ev: string, extra: unknown) => {
      try {
        this.emit(ev, Object.assign({ jid: u.id }, extra));
      } catch {  }
    };
    if (u.subject) emit("group.subject", { subject: u.subject });
    if (u.desc !== undefined) emit("group.desc", { desc: u.desc });
    if (u.announce !== undefined) emit("group.announce", { announce: u.announce });
    if (u.restrict !== undefined) emit("group.restrict", { restrict: u.restrict });
    if (u.memberAddMode !== undefined) emit("group.memberAddMode", { mode: u.memberAddMode });
    if (u.joinApprovalMode !== undefined) emit("group.joinApprovalMode", { mode: u.joinApprovalMode });
  }

  botFn(): ((id: string) => boolean) | null {
    const b = this.opts.bot;
    if (typeof b === "function") return b as (id: string) => boolean;
    return null;
  }

  serializeCtx(): Record<string, unknown> {
    return {
      store: this.store,
      botFn: this.botFn(),
      emit: (ev: string, data: unknown) => {
        try {
          this.emit(ev, data);
        } catch {  }
      }
    };
  }

  isOwnNoise(m: any): boolean {
    if (!m) return true;
    if (m.isBaileys) return true;
    const chat = String(m.chat || "");
    const sender = String(m.sender || "");
    if (/@(newsletter|broadcast)/i.test(chat) || /@(newsletter|broadcast)/i.test(sender)) return true;
    if (chat === "status@broadcast") return true;
    return false;
  }

  async handleMessage(raw: unknown): Promise<void> {
    const m = await serializeM(this.sock, raw, this.serializeCtx());
    if (!m || !m.message) return;
    if (this.isOwnNoise(m)) return;
    const parsed = this.parseCommand(m.text);
    const payload = { m, command: (parsed && parsed.command) || "", args: (parsed && parsed.args) || [], isCommand: !!parsed };
    if (parsed) {
      m.command = parsed.command;
      m.args = parsed.args;
      m.isCommand = true;
    } else {
      m.isCommand = false;
    }
    try {
      this.emit("import", payload);
    } catch {  }
    if (!parsed) {
      if (m.tapId) await this.runTapCommand(m, m.tapId);
      return;
    }
    for (const pl of this.plugins.values()) {
      if (!this.matchCommand(pl, parsed.command)) continue;
      try {
        await pl.run?.(m, { conn: this, args: parsed.args, command: parsed.command });
      } catch (e: any) {
        this.emit("error", { message: "Plugin " + parsed.command + ": " + ((e && e.message) || e) });
      }
    }
  }

  async runTapCommand(m: any, tapId: string): Promise<boolean> {
    m.command = tapId;
    m.args = [];
    m.isCommand = true;
    let ran = false;
    for (const pl of this.plugins.values()) {
      if (!this.matchCommand(pl, tapId)) continue;
      ran = true;
      try {
        await pl.run?.(m, { conn: this, args: [], command: tapId });
      } catch (e: any) {
        this.emit("error", { message: "Plugin " + tapId + ": " + ((e && e.message) || e) });
      }
    }
    return ran;
  }

  extendSock(sock: any, B: any): void {
    sock.decodeJid = (jid: string) => {
      try {
        if (!jid) return jid;
        if (B.jidNormalizedUser) return B.jidNormalizedUser(jid);
        if (B.jidDecode) {
          const d = B.jidDecode(jid);
          if (d && d.user) return d.user + "@" + (d.server || "s.whatsapp.net");
        }
      } catch {  }
      return jid;
    };
    sock.getName = (jid: string) => {
      try {
        if (!jid) return "";
        if (this.store?.contacts?.[jid]) {
          const c = this.store.contacts[jid];
          const bare = (B.jidDecode && B.jidDecode(jid)?.user) || String(jid).split("@")[0];
          return c.name || c.notify || bare;
        }
      } catch {  }
      return (B.jidDecode && B.jidDecode(jid)?.user) || String(jid).split("@")[0];
    };
    sock.downloadM = async (msg: unknown, type: string, save?: string | boolean) => {
      const stream = await B.downloadContentFromMessage(msg, type);
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk as Buffer]);
      if (save) {
        const out = typeof save === "string" ? save : path.join(os.tmpdir(), "dl_" + Date.now());
        await fs.promises.writeFile(out, buf);
        return out;
      }
      return buf;
    };
    sock.reply = (jid: string, text: unknown, quoted?: unknown, options?: Record<string, unknown>) =>
      sock.sendMessage(jid, Object.assign({ text: String(text == null ? "" : text) }, options), quoted ? { quoted } : {});
    sock.sendFile = (jid: string, file: unknown, filename?: string, caption?: string, quoted?: unknown) => WA.file(sock, jid, file, filename, caption, quoted);
    sock.copyNForward = (jid: string, msg: unknown, force?: boolean, options?: Record<string, unknown>) =>
      sock.sendMessage(jid, Object.assign({ forward: msg, forceForward: force !== false }, options || {}));
    sock.forwardMessage = (jid: string, msg: unknown, force?: boolean) => sock.copyNForward(jid, msg, force === true);
    sock.cMod = (jid: string, msg: unknown, text: string, _sender: unknown, options?: Record<string, unknown>) =>
      sock.sendMessage(jid, Object.assign({ forward: msg, caption: text || undefined }, options || {}));
  }

  get conn(): any {
    return this.sock;
  }

  async sendMessage(jid: string, content: unknown, options?: unknown): Promise<unknown> {
    return this.sock.sendMessage(jid, content, (options || {}) as object);
  }

  async reply(jid: string, text: unknown, quoted?: unknown): Promise<unknown> {
    return this.sock.reply(jid, text, quoted);
  }

  async sendPoll(jid: string, question: string, opts: string[] | { options?: string[] }, quoted?: unknown): Promise<unknown> {
    const o = Array.isArray(opts) ? { options: opts } : opts || {};
    return WA.poll(this.sock, jid, question, o.options, quoted);
  }

  async sendMessageModify(jid: string, text: unknown, quoted?: unknown, preview: Record<string, any> = {}): Promise<unknown> {
    const content: Record<string, unknown> = { text: String(text == null ? "" : text) };
    if (preview.url || preview.title) {
      content.linkPreview = {
        head: preview.title || "",
        body: preview.body || "",
        thumbnail: preview.thumbnail,
        url: preview.url || ""
      };
    }
    return this.sock.sendMessage(jid, content, quoted ? { quoted } : {});
  }

  async sendFile(jid: string, src: unknown, filename?: string, caption?: string, quoted?: unknown): Promise<unknown> {
    return WA.file(this.sock, jid, src, filename, caption, quoted);
  }

  async sendSticker(jid: string, bufOrPath: Buffer, quoted?: unknown, meta?: { packname?: string; author?: string }): Promise<unknown> {
    return WA.sticker(this.sock, jid, bufOrPath, quoted, meta);
  }

  async groupStatus(jid: string, content: unknown): Promise<unknown> {
    return this.sock.sendMessage("status@broadcast", content, {});
  }

  async sendReact(jid: string, key: unknown, emoji?: string): Promise<unknown> {
    return this.sock.sendMessage(jid, { react: { text: String(emoji || ""), key } });
  }

  async rejectCall(callId: string, callFrom: string): Promise<unknown> {
    return WA.rejectCall(this.sock, callId, callFrom);
  }

  watchCalls(fn: (call: any) => void): unknown {
    return WA.watchCalls(this.sock, fn);
  }

  async sendContact(jid: string, name: string, number: string, quoted?: unknown): Promise<unknown> {
    const num = String(number || name || "").replace(/\D/g, "");
    const display = String(name || num);
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:" + display + "\nTEL;type=CELL;type=VOICE;waid=" + num + ":+" + num + "\nEND:VCARD";
    return this.sock.sendMessage(jid, { contacts: { displayName: display, contacts: [{ vcard }] } }, quoted ? { quoted } : {});
  }

  async sendLinkPreview(jid: string, text: unknown, quoted?: unknown, preview?: Record<string, any>): Promise<unknown> {
    return this.sendMessageModify(jid, text, quoted, preview);
  }

  async sendPtv(jid: string, src: unknown, quoted?: unknown, caption?: string): Promise<unknown> {
    const content: Record<string, unknown> = { video: src, ptv: true, gifPlayback: false };
    if (caption) content.caption = String(caption);
    return this.sock.sendMessage(jid, content, quoted ? { quoted } : {});
  }

  async sendAlbumMessage(jid: string, items: any[], quoted?: unknown): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const it of items || []) {
      out.push(await WA.file(this.sock, jid, it.src || it, it.filename, it.caption, quoted));
    }
    return out;
  }

  async sendProgress(jid: string, text: unknown, steps: string[], quoted?: unknown): Promise<unknown> {
    steps = steps || [];
    let key = await this.sock.sendMessage(jid, { text: String(text) }, quoted ? { quoted } : {});
    for (const s of steps) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        key = await this.sock.sendMessage(jid, { text: String(s), edit: key.key });
      } catch {  }
    }
    return key;
  }

  async replyAI(jid: string, text: unknown, quoted?: unknown): Promise<unknown> {
    return this.reply(jid, text, quoted);
  }

  async copyNForward(jid: string, msg: unknown, force?: boolean, options?: Record<string, unknown>): Promise<unknown> {
    return this.sock.copyNForward(jid, msg, force, options);
  }

  async forward(jid: string, msg: unknown, force = true, options?: Record<string, unknown>): Promise<unknown> {
    return WA.forward(this.sock, jid, msg, force, options);
  }

  async downloadMediaMessage(msg: unknown, kind?: string): Promise<Buffer> {
    return WA.download(msg, kind || "buffer", this.sock, msg);
  }

  getCachedMessage(key: any): unknown {
    try {
      const id = key && (typeof key === "string" ? key : key.id);
      if (id) return this.messageCache.get(id);
    } catch {  }
    return undefined;
  }

  watchPoll(fn: (key: any, tally: unknown, updates: unknown[]) => void): void {
    WA.watchPoll(this.sock, async (key: any) => this.getCachedMessage(key), fn);
  }

  async groupAdmin(chat: string, action: WA.GroupAdminAction, users: string | string[]): Promise<unknown> {
    return WA.groupAdmin(this.sock, chat, action, users);
  }

  async groupApprove(chat: string, users: string | string[], approve = true): Promise<unknown> {
    return WA.groupApprove(this.sock, chat, users, approve);
  }

  async broadcast(jids: string[], content: (jid: string) => unknown, gapMs?: number): Promise<WA.BroadcastResult[]> {
    return WA.broadcast(this.sock, jids, content, gapMs);
  }

  async typing(chat: string, action?: WA.PresenceAction, ms?: number): Promise<unknown> {
    return WA.typing(this.sock, chat, action, ms);
  }

  async sendButtons(jid: string, text: unknown, list: WA.ButtonInput[], footer?: string | null, quoted?: any, media?: WA.ButtonMedia, flow?: { messageParamsJson?: string }): Promise<unknown> {
    return WA.buttons(this.sock, jid, text, list, footer, quoted, media, flow);
  }

  async sendIAMessage(jid: string, list: WA.ButtonInput[], quoted?: any, opts?: WA.IAMessageOptions): Promise<unknown> {
    return WA.sendIAMessage(this.sock, jid, list, quoted, opts);
  }

  async sendGroupInvite(participant: string, groupJid: string, inviteCode: string, inviteTtl?: number | string, groupName?: string, caption?: string): Promise<unknown> {
    return WA.groupInvite(this.sock, participant, groupJid, inviteCode, inviteTtl, groupName, caption);
  }

  async newsletterQuery(type: string, jid: string): Promise<unknown> {
    return WA.newsletterQuery(this.sock, type, jid);
  }

  async sendHtml(jid: string, opts?: WA.HtmlOptions): Promise<unknown> {
    return WA.sendHtml(this.sock, jid, opts);
  }

  async sendAd(jid: string, text: unknown, ad: WA.AdReplyOptions, quoted?: unknown): Promise<unknown> {
    return WA.sendAd(this.sock, jid, text, ad, quoted);
  }

  async sendRichResponse(jid: string, blocks: WA.RichBlock[], opts?: WA.RichOptions): Promise<unknown> {
    return WA.sendRichResponse(this.sock, jid, blocks, opts);
  }

  async deleteMessage(jid: string, keyOrId: unknown): Promise<unknown> {
    return WA.deleteMessage(this.sock, jid, keyOrId);
  }

  async sendMetaMsg(jid: string, blocks: WA.MetaBlock[], opts?: WA.MetaOptions): Promise<unknown> {
    return WA.sendMetaMsg(this.sock, jid, blocks, opts);
  }

  async carousel(jid: string, cards: WA.CarouselCard[], opts?: WA.CarouselOptions): Promise<unknown> {
    return WA.carousel(this.sock, jid, cards, opts);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }
    } catch {  }
    try {
      if (this.sock && this.sock.ws) this.sock.ws.close();
    } catch {  }
    try {
      if (this.opts.presence && this.sock) await this.sock.sendPresenceUpdate("unavailable");
    } catch {  }
    this.sock = null;
  }
}

export default Connection;
