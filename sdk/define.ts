import * as text from "./text.js";

export interface DefineUser {
  id: string;
  name: string;
}

export interface DefineContext {
  platform: string;
  text: string;
  args: string[];
  named: Record<string, unknown>;
  user: DefineUser;
  reply: (msg: unknown, opts?: unknown) => Promise<unknown>;
  raw?: unknown;
}

export interface DefineInput {
  name?: string | string[];
  names?: string | string[];
  command?: string | string[];
  description?: string;
  help?: string | string[];
  tags?: string | string[];
  category?: string | string[];
  use?: string;
  filePath?: string;
  file?: string;
  options?: unknown[];
  cooldown?: number;
  run?: (ctx: DefineContext) => unknown | Promise<unknown>;
}

export interface PluginHandler {
  run: (...args: unknown[]) => unknown;
  [key: string]: unknown;
}

export interface DefinedPlugin {
  names: string[];
  name: string;
  command: string[];
  description: string;
  help: string[];
  tags: string | string[];
  category: string | string[];
  use: string;
  filePath: string;
  file: string;
  options: unknown[];
  cooldown: number;
  run: (ctx: DefineContext) => unknown | Promise<unknown>;
  whatsapp: PluginHandler;
  telegram: PluginHandler;
  discord: PluginHandler;
  wa: PluginHandler;
  tg: PluginHandler;
  dc: PluginHandler;
  text: typeof text;
}

const cooldowns = new Map<string, number>();

function namesOf(m: DefineInput): string[] {
  const raw = m.names || m.name || m.command;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return [raw];
  return ["unnamed"];
}

function checkCooldown(names: string[], userId: string, seconds: number): number {
  if (!seconds || !userId) return 0;
  const now = Date.now();
  for (const n of names) {
    const k = String(n).toLowerCase() + ":" + String(userId);
    const left = (cooldowns.get(k) || 0) + seconds * 1000 - now;
    if (left > 0) return Math.ceil(left / 1000);
    cooldowns.set(k, now);
  }
  return 0;
}

function splitArgs(s: unknown): string[] {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function baseCtx(platform: string, content: unknown): DefineContext {
  const t = String(content || "");
  return {
    platform,
    text: t,
    args: splitArgs(t),
    named: {},
    user: { id: "", name: "User" },
    reply: async () => {}
  };
}

export function define(m: DefineInput = {}): DefinedPlugin {
  const names = namesOf(m);
  const run = m.run || (async () => {});
  const cooldown = m.cooldown || 0;
  const helpInput = Array.isArray(m.help) ? m.help.map(String) : typeof m.help === "string" ? [m.help] : names.slice();
  const desc = m.description || helpInput.join(", ") || names.join(", ");
  const tags = m.tags || m.category || "misc";
  const category = m.category || m.tags || "misc";
  const useStr = m.use || "";
  const fileStr = m.filePath || m.file || "";

  async function guarded(platform: string, ctx: DefineContext): Promise<void> {
    ctx.platform = platform;
    if (!ctx.args) ctx.args = splitArgs(ctx.text);
    const wait = checkCooldown(names, ctx.user && ctx.user.id, cooldown);
    if (wait > 0) {
      await ctx.reply("Slow down, wait " + wait + "s.");
      return;
    }
    await run(ctx);
  }

  const whatsapp: PluginHandler = {
    name: names[0],
    names: names,
    command: names,
    description: desc,
    help: helpInput,
    tags: tags,
    category: category,
    use: useStr,
    filePath: fileStr,
    file: fileStr,
    run: async (msg: any, extra: any = {}) => {
      const ctx = baseCtx("whatsapp", extra.text || msg.text || msg.body || "");
      ctx.user = { id: String(msg.sender || ""), name: msg.pushName || "User" };
      ctx.named = extra.named || {};
      ctx.reply = (t: unknown) => msg.reply(t);
      ctx.raw = msg;
      await guarded("whatsapp", ctx);
    }
  };

  const telegram: PluginHandler = {
    name: names[0],
    names: names,
    command: names,
    description: desc,
    help: helpInput,
    tags: tags,
    category: category,
    use: useStr,
    filePath: fileStr,
    file: fileStr,
    run: async (gramCtx: any) => {
      const t = gramCtx.message || gramCtx.msg || {};
      const from = gramCtx.from || {};
      if (from.is_bot) return;
      const parts = String(t.text || "").trim().split(/\s+/);
      if (parts[0] && parts[0].startsWith("/")) parts.shift();
      const ctx = baseCtx("telegram", parts.join(" "));
      ctx.user = { id: String(from.id || ""), name: from.username || from.first_name || "User" };
      ctx.reply = (msg: unknown, opt: unknown) => gramCtx.reply(msg, opt);
      ctx.raw = gramCtx;
      await guarded("telegram", ctx);
    }
  };

  const discord: PluginHandler = {
    name: names[0],
    names: names,
    command: names,
    description: desc,
    help: helpInput,
    tags: tags,
    category: category,
    use: useStr,
    filePath: fileStr,
    file: fileStr,
    options: m.options || [],
    run: async (interaction: any) => {
      if (interaction.user && interaction.user.bot) return;
      const parts: string[] = [];
      const named: Record<string, unknown> = {};
      const dig = (opts: any[]) => {
        for (const x of opts || []) {
          if (x.type === 1 || x.type === 2) {
            if (x.name) parts.push(String(x.name));
            dig(x.options);
          } else if (x.value !== undefined) {
            parts.push(String(x.value));
            if (x.name) named[String(x.name)] = x.value;
          }
        }
      };
      dig(interaction.options && interaction.options.data);
      const ctx = baseCtx("discord", parts.join(" "));
      ctx.named = named;
      ctx.user = { id: String((interaction.user && interaction.user.id) || ""), name: (interaction.user && interaction.user.username) || "User" };
      ctx.reply = (payload: unknown) => interaction.reply(payload);
      ctx.raw = interaction;
      await guarded("discord", ctx);
    }
  };

  return {
    names,
    name: names[0],
    command: names,
    description: desc,
    help: helpInput,
    tags: tags,
    category: category,
    use: useStr,
    filePath: fileStr,
    file: fileStr,
    options: m.options || [],
    cooldown,
    run,
    whatsapp,
    telegram,
    discord,
    wa: whatsapp,
    tg: telegram,
    dc: discord,
    text
  };
}
