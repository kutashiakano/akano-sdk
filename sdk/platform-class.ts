import fs from "node:fs";
import path from "node:path";
import { Connection } from "../lib/connection.js";
import { freshRequire, need } from "./loader.js";
import * as proxy from "./common/proxy.js";

export interface PlatformPlugin {
  run?: (...args: any[]) => unknown;
  names?: string[];
  command?: string | string[];
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface BotPlugin {
  whatsapp?: PlatformPlugin;
  telegram?: PlatformPlugin;
  discord?: PlatformPlugin;
  wa?: PlatformPlugin;
  tg?: PlatformPlugin;
  dc?: PlatformPlugin;
  run?: (...args: any[]) => unknown;
  description?: string;
  [key: string]: unknown;
}

export function loadPlugins(dir: string): BotPlugin[] {
  const out: BotPlugin[] = [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const full = path.join(dir, f);
      const pl = freshRequire(full) as BotPlugin;
      if (pl && (pl.whatsapp || pl.telegram || pl.discord || pl.wa || pl.tg || pl.dc || pl.run)) out.push(pl);
    } catch {  }
  }
  return out;
}

export function namesOf(pl: PlatformPlugin): string[] {
  if (Array.isArray(pl.names) && pl.names.length) return pl.names;
  if (Array.isArray(pl.command) && pl.command.length) return pl.command;
  if (typeof pl.name === "string" && pl.name) return [pl.name];
  if (typeof pl.command === "string" && pl.command) return [pl.command];
  return [];
}

export interface PairingOptions {
  state?: boolean;
  number?: string;
  code?: string;
}

export interface PlatformOptions {
  platform?: string;
  plugins_dir?: string;
  session_dir?: string;
  online?: boolean;
  presence?: boolean | Record<string, unknown>;
  pairing?: PairingOptions;
  token?: string;
  telegram_token?: string;
  discord_token?: string;
  discord_guild_id?: string | string[];
  [key: string]: unknown;
}

export interface ResolvedPlatformOptions {
  platform: string;
  plugins_dir: string;
  session_dir: string;
  online: boolean;
  presence: boolean | Record<string, unknown>;
  pairing: PairingOptions;
  token: string;
  telegram_token: string;
  discord_token: string;
  discord_guild_id?: string | string[];
}

function guildIds(v: unknown): string[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : String(v).split(/[,\s]+/);
  return list.map((g) => String(g).trim()).filter(Boolean);
}

const shutdownBots: any[] = [];
let shutdownArmed = false;

function armShutdown(bot: any): void {
  if (bot) shutdownBots.push(bot);
  if (shutdownArmed) return;
  shutdownArmed = true;
  const stop = () => {
    for (const b of shutdownBots) {
      try {
        if (b && typeof b.stop === "function") b.stop();
      } catch {}
    }
  };
  try {
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch {}
}

export interface PlatformStartResult {
  whatsapp?: unknown;
  telegram?: unknown;
  discord?: unknown;
  wa?: unknown;
  tg?: unknown;
  dc?: unknown;
}

export class Platform {
  opts: ResolvedPlatformOptions;
  extra: Record<string, any>;
  events: Record<string, ((data: any) => void)[]>;
  client: any = null;
  plugins: BotPlugin[] = [];

  constructor(opts: PlatformOptions = {}, extra: Record<string, any> = {}) {
    this.opts = Object.assign(
      {
        platform: "all",
        plugins_dir: "./bot/plugins",
        session_dir: "./session",
        online: false,
        presence: false,
        pairing: { state: false, number: "" },
        token: "",
        telegram_token: "",
        discord_token: ""
      },
      opts
    ) as Platform["opts"];
    if (this.opts.token && !this.opts.telegram_token && !this.opts.discord_token) {
      this.opts.telegram_token = this.opts.token;
      this.opts.discord_token = this.opts.token;
    }
    this.extra = extra || {};
    this.events = {};
  }

  on(evt: string, fn: (data: any) => void): this {
    if (!this.events[evt]) this.events[evt] = [];
    this.events[evt].push(fn);
    if (this.client && typeof this.client.on === "function") {
      try {
        this.client.on(evt, fn);
      } catch {  }
    }
    return this;
  }

  emit(evt: string, data: unknown): void {
    for (const fn of this.events[evt] || []) {
      try {
        fn(data);
      } catch {  }
    }
  }

  loadPlugins(): BotPlugin[] {
    const dir = path.isAbsolute(this.opts.plugins_dir) ? this.opts.plugins_dir : path.join(process.cwd(), this.opts.plugins_dir);
    this.plugins = loadPlugins(dir);
    return this.plugins;
  }

  async start(): Promise<unknown> {
    const raw = String(this.opts.platform || "all").toLowerCase();
    const platform = raw === "tg" ? "telegram" : raw === "dc" ? "discord" : raw === "wa" ? "whatsapp" : raw;
    this.loadPlugins();
    if (platform === "telegram") return this.startTelegram();
    if (platform === "discord") return this.startDiscord();
    if (platform === "whatsapp") return this.startWhatsapp();
    const out: PlatformStartResult = { whatsapp: null, telegram: null, discord: null, wa: null, tg: null, dc: null };
    try {
      const waP = this.startWhatsapp() as unknown as Promise<unknown> | null;
      if (waP && typeof (waP as Promise<unknown>).catch === "function") {
        (waP as Promise<unknown>).then((inst) => {
          out.whatsapp = inst;
          out.wa = inst;
        }).catch((e) => {
          this.emit("error", { message: "[whatsapp] " + ((e && e.message) || e).slice(0, 80) });
        });
      }
    } catch (e: any) {
      this.emit("error", { message: "[whatsapp] " + ((e && e.message) || e).slice(0, 80) });
    }
    if (this.opts.telegram_token) {
      try {
        const tgP = this.startTelegram();
        tgP
          .then((inst) => {
            out.telegram = inst;
            out.tg = inst;
          })
          .catch((e) => {
            this.emit("error", e);
          });
      } catch (e) {
        this.emit("error", e);
      }
    } else {
      this.emit("ready", { message: "[telegram] skipped (no telegram_token)" });
      out.telegram = null;
      out.tg = null;
    }
    if (this.opts.discord_token) {
      out.discord = await this.startDiscord().catch((e) => {
        this.emit("error", e);
        return null;
      });
      out.dc = out.discord;
    } else {
      this.emit("ready", { message: "[discord] skipped (no discord_token)" });
      out.discord = null;
      out.dc = null;
    }
    return out;
  }

  async startWhatsapp(): Promise<unknown> {
    const inst = new Connection(
      Object.assign(
        {
          plugins_dir: this.opts.plugins_dir,
          session_dir: this.opts.session_dir,
          online: this.opts.online,
          presence: this.opts.presence,
          pairing: this.opts.pairing
        },
        this.extra
      )
    );
    this.client = inst;
    inst.on("prepare", (x: unknown) => this.emit("ready", x));
    inst.on("connect", (x: unknown) => this.emit("connect", x));
    inst.on("error", (x: unknown) => this.emit("error", x));
    inst.on("call", (x: unknown) => this.emit("call", x));
    inst.connect().catch(() => {});
    return inst;
  }

  async rejectCall(callId: string, callFrom: string): Promise<unknown> {
    const client = this.client as { rejectCall?: (id: string, from: string) => Promise<unknown>; sock?: { rejectCall?: (id: string, from: string) => Promise<unknown> } } | null;
    if (client && typeof client.rejectCall === "function") return client.rejectCall(callId, callFrom);
    if (client && client.sock && typeof client.sock.rejectCall === "function") return client.sock.rejectCall(callId, callFrom);
    throw new Error("No WhatsApp client started.");
  }

  watchCalls(fn: (call: any) => void): void {
    this.on("call", (calls: unknown) => {
      for (const c of (calls as any[]) || []) {
        if (c.status === "offer") fn(c);
      }
    });
  }

  watchPoll(fn: (key: any, tally: unknown, updates: unknown[]) => void): void {
    const client = this.client as { watchPoll?: (fn: (key: any, tally: unknown, updates: unknown[]) => void) => void } | null;
    if (client && typeof client.watchPoll === "function") return client.watchPoll(fn);
    throw new Error("No WhatsApp client started.");
  }

  getCachedMessage(key: any): unknown {
    const client = this.client as { getCachedMessage?: (key: any) => unknown } | null;
    if (client && typeof client.getCachedMessage === "function") return client.getCachedMessage(key);
    return undefined;
  }

  async startTelegram(): Promise<unknown> {
    const token = this.opts.telegram_token;
    if (!token) throw new Error("set telegram_token in config");
    const { Bot } = need("grammy");
    const botOpts: Record<string, any> = Object.assign({}, this.extra.botOptions || {});
    if (!(botOpts.client || {}).baseFetch && proxy.getProxyUrl(this.opts as any)) {
      botOpts.client = Object.assign({}, botOpts.client, {
        baseFetch: (url: string, init?: unknown) => proxy.proxyFetch(url, (init || {}) as never)
      });
    }
    const bot = new Bot(token, botOpts);
    this.client = bot;
    try {
      const { autoRetry } = need("@grammyjs/auto-retry");
      if (autoRetry && bot.api && bot.api.config) bot.api.config.use(autoRetry());
    } catch {}
    try {
      const { hydrateFiles } = need("@grammyjs/files");
      if (hydrateFiles && bot.api && bot.api.config) bot.api.config.use(hydrateFiles(token));
    } catch {}
    if (this.opts.presence) {
      bot.use(async (ctx: any, next: () => Promise<void>) => {
        try {
          await ctx.replyWithChatAction("typing");
        } catch {}
        await next();
      });
    }
    const commands: { command: string; description: string }[] = [];
    for (const pl of this.plugins) {
      const handler = (pl.telegram || pl.tg) as PlatformPlugin | undefined;
      if (handler && typeof handler.run === "function") {
        for (const n of namesOf(handler)) {
          try {
            bot.command(n, (ctx: unknown) => (handler.run as (...a: any[]) => unknown)(ctx));
          } catch {  }
          if (!commands.some((c) => c.command === n)) {
            commands.push({ command: n, description: String(pl.description || (handler as { description?: unknown }).description || n).slice(0, 256) });
          }
        }
      }
    }
    if (commands.length) {
      bot.api.setMyCommands(commands).catch(() => {});
    }
    armShutdown(bot);
    bot.catch((e: unknown) => this.emit("error", e));
    bot.on("message", (ctx: unknown) => this.emit("message", ctx));
    bot.start().catch((e: unknown) => this.emit("error", e));
    this.emit("ready", { message: "telegram polling started" });
    return bot;
  }

  async startTg(): Promise<unknown> {
    return this.startTelegram();
  }

  async startDiscord(): Promise<unknown> {
    const token = this.opts.discord_token;
    if (!token) throw new Error("set discord_token in config");
    const { Client, GatewayIntentBits, REST, Routes } = need("discord.js");
    const client = new Client(Object.assign({ intents: [GatewayIntentBits.Guilds] }, this.extra.clientOptions || {}));
    this.client = client;
    const routes: { name: string; description: string; options?: unknown[] }[] = [];
    for (const pl of this.plugins) {
      const handler = (pl.discord || pl.dc) as PlatformPlugin | undefined;
      if (handler && typeof handler.run === "function") {
        const n = namesOf(handler)[0];
        if (n) routes.push({ name: n, description: String(pl.description || handler.description || n).slice(0, 100), options: (handler as { options?: unknown[] }).options || [] });
      }
    }
    const byName: Record<string, PlatformPlugin> = {};
    for (const pl of this.plugins) {
      const handler = (pl.discord || pl.dc) as PlatformPlugin | undefined;
      if (handler) for (const n of namesOf(handler)) byName[n] = handler;
    }
    client.on("interactionCreate", async (interaction: any) => {
      try {
        if (interaction.isChatInputCommand() && byName[interaction.commandName]) {
          await byName[interaction.commandName].run!(interaction);
        }
      } catch {  }
      this.emit("message", interaction);
    });
    client.once("clientReady", async () => {
      try {
        if (this.opts.presence || this.opts.online) {
          const data = typeof this.opts.presence === "object" && this.opts.presence !== null ? this.opts.presence : { status: "online" };
          client.user.setPresence(data);
        }
        const rest = new REST().setToken(token);
        const guilds = guildIds(this.opts.discord_guild_id ?? (this.extra as Record<string, unknown>).discordGuildId);
        if (guilds.length) {
          for (const gid of guilds) await rest.put(Routes.applicationGuildCommands(client.user.id, gid), { body: routes });
        } else {
          await rest.put(Routes.applicationCommands(client.user.id), { body: routes });
        }
        this.emit("ready", { message: "discord logged in as " + client.user.tag });
      } catch (e) {
        this.emit("error", e);
      }
    });
    await client.login(token);
    return client;
  }

  async startDc(): Promise<unknown> {
    return this.startDiscord();
  }

  async startWa(): Promise<unknown> {
    return this.startWhatsapp();
  }
}
