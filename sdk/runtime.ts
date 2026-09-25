import Connection from "../lib/connection.js";
import { Database } from "../lib/database.js";
import { Platform } from "./platform-class.js";

export interface RuntimeOptions {
  platforms?: string;
  platform?: string;
  whatsapp?: Record<string, unknown>;
  telegramToken?: string;
  telegram_token?: string;
  discordToken?: string;
  discord_token?: string;
  databaseUrl?: string | null;
  databaseName?: string;
  saveInterval?: number;
  ramLimit?: number;
  onEvent?: (platform: string, evt: string, data: unknown) => void;
  onMemoryLimit?: (rss: number) => void;
}

export interface Runtime {
  database: { fetch: () => Promise<any>; save: (data: any) => Promise<unknown> };
  data: Record<string, unknown> | null;
  whatsapp: InstanceType<typeof Connection> | null;
  telegram: Platform | null;
  discord: Platform | null;
  timers: ReturnType<typeof setInterval>[];
  start: () => Promise<Runtime>;
  stop: () => Promise<void>;
}

function wanted(list: string[], name: string): boolean {
  return list.includes("all") || list.includes(name);
}

export function createRuntime(opts: RuntimeOptions = {}): Runtime {
  const platforms = String(opts.platforms || opts.platform || "whatsapp")
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const system = Database.create(opts.databaseUrl || null, opts.databaseName || "sdk");
  const rt: Runtime = {
    database: system.database,
    data: null,
    whatsapp: null,
    telegram: null,
    discord: null,
    timers: [],
    async start() {
      this.data = Object.assign({ users: {}, groups: {}, chats: {}, setting: {} }, (await system.database.fetch()) || {});
      await system.database.save(this.data);
      if (wanted(platforms, "whatsapp")) {
        this.whatsapp = new Connection(Object.assign({ plugins_dir: "./plugins", session_dir: "./session", online: true }, opts.whatsapp || {}));
        if (typeof opts.onEvent === "function") {
          for (const evt of ["prepare", "connect", "error", "import"]) this.whatsapp.on(evt, (x: unknown) => (opts.onEvent as NonNullable<RuntimeOptions["onEvent"]>)("whatsapp", evt, x));
        }
        this.whatsapp.connect().catch(() => {});
      }
      if (wanted(platforms, "telegram") && (opts.telegramToken || opts.telegram_token)) {
        this.telegram = new Platform({ platform: "telegram", plugins_dir: "./plugins", telegram_token: (opts.telegramToken || opts.telegram_token) as string });
        if (typeof opts.onEvent === "function") {
          for (const evt of ["ready", "error", "message"]) this.telegram.on(evt, (x: unknown) => (opts.onEvent as NonNullable<RuntimeOptions["onEvent"]>)("telegram", evt, x));
        }
        this.telegram.start().catch(() => {});
      }
      if (wanted(platforms, "discord") && (opts.discordToken || opts.discord_token)) {
        this.discord = new Platform({ platform: "discord", plugins_dir: "./plugins", discord_token: (opts.discordToken || opts.discord_token) as string });
        if (typeof opts.onEvent === "function") {
          for (const evt of ["ready", "error", "message"]) this.discord.on(evt, (x: unknown) => (opts.onEvent as NonNullable<RuntimeOptions["onEvent"]>)("discord", evt, x));
        }
        this.discord.start().catch(() => {});
      }
      const saveEvery = Number(opts.saveInterval) > 0 ? Number(opts.saveInterval) : 120000;
      this.timers.push(
        setInterval(() => {
          if (this.data) system.database.save(this.data).catch(() => {});
        }, saveEvery)
      );
      if (opts.ramLimit) {
        const limit = typeof opts.ramLimit === "number" ? opts.ramLimit : 0;
        if (limit > 0) {
          this.timers.push(
            setInterval(() => {
              const rss = process.memoryUsage().rss;
              if (rss >= limit && typeof opts.onMemoryLimit === "function") opts.onMemoryLimit(rss);
            }, 60000)
          );
        }
      }
      return this;
    },
    async stop() {
      for (const t of this.timers) clearInterval(t);
      this.timers = [];
      if (this.data) await system.database.save(this.data).catch(() => {});
      if (this.whatsapp) await this.whatsapp.close().catch(() => {});
    }
  };
  return rt;
}
