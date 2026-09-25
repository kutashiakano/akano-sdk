import * as text from "./text.js";
import { texted, status } from "./core.js";
import { engine } from "./discord.js";

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

export interface BotHost {
  settings?: Record<string, any>;
  config?: unknown;
  db?: () => any;
  fmt?: { texted?: (...a: any[]) => any; status?: (...a: any[]) => any };
  loadBuilders?: () => Record<string, any>;
  logError?: (...a: any[]) => void;
}

export interface BotDefineOption {
  name: string;
  type?: number;
  desc?: string;
  description?: string;
  required?: boolean;
  choices?: unknown;
  min_value?: number;
  max_value?: number;
  options?: BotDefineOption[];
}

export interface BotDefineInput {
  usage?: string | string[];
  name?: string | string[];
  names?: string | string[];
  command?: string | string[];
  help?: string;
  desc?: string;
  category?: string;
  options?: BotDefineOption[];
  owner?: boolean;
  rowner?: boolean;
  premium?: boolean;
  group?: boolean;
  admin?: boolean;
  private?: boolean;
  botAdmin?: boolean;
  reg?: boolean;
  limit?: boolean | number;
  cooldown?: number;
  example?: string;
  use?: string;
  wait?: boolean;
  hidden?: boolean;
  run?: (...args: any[]) => unknown;
  async?: (...args: any[]) => unknown;
  defaultMemberPermissions?: unknown;
  [key: string]: unknown;
}

function botMapOpt(o: BotDefineOption): Record<string, any> {
  const r: Record<string, any> = {
    name: o.name,
    type: o.type || 3,
    description: o.desc || o.description || o.name,
    required: !!o.required
  };
  if (o.choices) r.choices = o.choices;
  if (o.min_value !== undefined) r.min_value = o.min_value;
  if (o.max_value !== undefined) r.max_value = o.max_value;
  if (Array.isArray(o.options)) r.options = o.options.map(botMapOpt);
  return r;
}

function botPassthrough(m: BotDefineInput): Record<string, any> {
  const own = new Set(["name", "command", "help", "desc", "category", "options", "owner", "rowner", "premium", "group", "admin", "private", "botAdmin", "reg", "limit", "cooldown", "example", "wait", "run"]);
  const extra: Record<string, any> = {};
  for (const k of Object.keys(m)) {
    if (!own.has(k) && m[k] !== undefined) extra[k] = m[k];
  }
  return extra;
}

function defaultBuilders(): Record<string, any> | null {
  let d: any = null;
  try {
    d = engine();
  } catch {
    return null;
  }
  if (!d) return null;
  return {
    mbuilder: d.StringSelectMenuBuilder,
    bbuilder: d.ButtonBuilder,
    abuilder: d.ActionRowBuilder,
    ebuilder: d.EmbedBuilder,
    modal: d.ModalBuilder,
    textInput: d.TextInputBuilder,
    EmbedBuilder: d.EmbedBuilder,
    ActionRowBuilder: d.ActionRowBuilder,
    ButtonBuilder: d.ButtonBuilder,
    ButtonStyle: d.ButtonStyle,
    StringSelectMenuBuilder: d.StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder: d.StringSelectMenuOptionBuilder,
    ModalBuilder: d.ModalBuilder,
    TextInputBuilder: d.TextInputBuilder,
    TextInputStyle: d.TextInputStyle,
    AttachmentBuilder: d.AttachmentBuilder,
    PermissionFlagsBits: d.PermissionFlagsBits,
    ChannelType: d.ChannelType,
    Colors: d.Colors,
    MessageFlags: d.MessageFlags,
    Collection: d.Collection,
    ComponentType: d.ComponentType
  };
}

export function defineBot(m: BotDefineInput = {}, host: BotHost = {}): Record<string, any> {
  const g: any = typeof globalThis !== "undefined" ? globalThis : {};
  const settings: Record<string, any> = host.settings || g.settings || {};
  const config: unknown = host.config !== undefined ? host.config : g.config || null;
  const getDB = (): any => {
    try {
      return host.db ? host.db() : null;
    } catch {
      return null;
    }
  };
  const fmt: any = host.fmt || { texted, status };
  const getBuilders = (): Record<string, any> => {
    try {
      if (host.loadBuilders) return host.loadBuilders() || {};
    } catch {  }
    try {
      return defaultBuilders() || {};
    } catch {
      return {};
    }
  };
  const logError = (...a: any[]): void => {
    try {
      const fn = host.logError || g.logError;
      if (typeof fn === "function") fn(...a);
    } catch {  }
  };
  const names = m.usage ? (Array.isArray(m.usage) ? m.usage : [m.usage]) : Array.isArray(m.name) ? m.name : [m.name || (m as any).command || "unnamed"];
  const run = m.run || m.async || (async () => {});
  const gate = {
    owner: (m as any).owner ?? false,
    rowner: (m as any).rowner ?? false,
    premium: (m as any).premium ?? false,
    group: (m as any).group ?? false,
    admin: (m as any).admin ?? false,
    private: (m as any).private ?? false,
    botAdmin: (m as any).botAdmin ?? false,
    reg: (m as any).reg ?? false,
    limit: (m as any).limit ?? false,
    cooldown: (m as any).cooldown ?? 0
  };
  const options = ((m as any).options || []).map(botMapOpt);
  const usage = (): string => names[0] + " " + options.map((o: any) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(" ");
  const mapNamed = (argsArray: unknown[]): Record<string, unknown> => {
    const named: Record<string, unknown> = {};
    if (options.length) {
      for (let i = 0; i < options.length; i++) named[options[i].name] = (argsArray as unknown[])[i];
    }
    return named;
  };
  const missingRequired = (named: Record<string, unknown>): any[] =>
    options.filter((o: any) => o.required && (named[o.name] === undefined || named[o.name] === ""));
  const phase: Record<string, any> = {
    __unified: true,
    name: names[0],
    description: (m as any).help || (m as any).desc || names.join(", "),
    help: (m as any).help || (m as any).desc || names.join(", "),
    command: names,
    tags: [(m as any).category || "tools"],
    options,
    ...gate,
    example: (m as any).example || (m as any).use || "",
    wait: !!(m as any).wait,
    error: 0,
    hidden: !!(m as any).hidden,
    use: (m as any).use || "",
    ...botPassthrough(m),
    async execute(interaction: any) {
      const named: Record<string, unknown> = {};
      const dig = (opts: any[]): void => {
        for (const x of opts || []) {
          if (x.type === 1 || x.type === 2) dig(x.options);
          else named[x.name] = x.value;
        }
      };
      dig(interaction.options && interaction.options.data);
      const argsArray = Object.values(named);
      const djs = getBuilders();
      const pctx: Record<string, any> = {
        platform: "discord",
        interaction,
        ...djs,
        args: argsArray,
        named,
        text: argsArray.join(" "),
        user: interaction.user,
        userId: interaction.user && interaction.user.id,
        guild: interaction.guild,
        channel: interaction.channel,
        sock: interaction.client,
        client: interaction.client,
        Utils: fmt,
        setting: settings,
        Config: config,
        DB: getDB(),
        db: (() => { try { return host.db ? host.db().get() : null; } catch { return null; } })(),
        reply: (content: unknown, extra: any = {}) =>
          new Promise((resolve) => {
            try {
              const result = interaction.reply({ content, flags: extra.ephemeral ? 64 : undefined });
              (result && typeof (result as any).then === "function" ? result : Promise.resolve()).then(resolve).catch(() => resolve());
            } catch {
              resolve(undefined);
            }
          }),
        editReply: (content: unknown) =>
          new Promise((resolve) => {
            try {
              const result = interaction.editReply({ content });
              (result && typeof (result as any).then === "function" ? result : Promise.resolve()).then(resolve).catch(() => resolve());
            } catch {
              resolve(undefined);
            }
          }),
        usage,
        fmt
      };
      try {
        const missing = missingRequired(named);
        if (missing.length) {
          return await pctx.reply("Missing required " + missing.map((o: any) => o.name).join(", ") + "\nUsage: " + names[0] + " " + missing.map((o: any) => `<${o.name}>`).join(" "), { ephemeral: true });
        }
        await run(pctx);
      } catch (e) {
        logError("dc.plugin." + names[0], e);
        await pctx.reply(fmt.status("error"), { ephemeral: true }).catch(() => {});
      }
    },
    async run(_m: any, _cmd: any) {
      const isWa = !!(_m && (_m.key && _m.key.id || _m.mtype));
      if (isWa) {
        const cmd = _cmd || {};
        const argsArray = Array.isArray(cmd.args) ? cmd.args : [];
        const named = mapNamed(argsArray);
        const pctx: Record<string, any> = {
          platform: "whatsapp",
          m: _m,
          that: this,
          props: cmd,
          args: argsArray,
          named,
          text: cmd.text || "",
          command: cmd.command || "",
          user: _m && _m.sender,
          isOwner: cmd.isOwner,
          isPrems: cmd.isPrems,
          isAdmin: cmd.isAdmin,
          isBotAdmin: cmd.isBotAdmin,
          sock: cmd.sock,
          client: cmd.sock,
          Utils: fmt,
          setting: settings,
          Config: config,
          DB: getDB(),
          db: (() => { try { return host.db ? host.db().get() : null; } catch { return null; } })(),
          reply: (t: unknown) => _m.reply(t),
          usage,
          fmt
        };
        const missing = missingRequired(named);
        if (missing.length) {
          return await _m.reply("Missing required: " + missing.map((o: any) => o.name).join(", ") + "\nUsage: " + usage());
        }
        return run(pctx);
      }
      const tg = _m || {};
      const rawCmd = Array.isArray(_cmd) ? _cmd : String(_cmd || "").split(/\s+/).filter(Boolean);
      const args = rawCmd;
      const named = mapNamed(args);
      const api = (tg && (tg.api || tg.telegram)) || null;
      const pctx: Record<string, any> = Object.create(tg);
      const overrides: Record<string, any> = {
        platform: "telegram",
        ctx: tg,
        args,
        named,
        text: args.join(" "),
        command: String((tg && tg.match && tg.match[0]) || ((tg && (tg.msg && tg.msg.text || tg.msg && tg.msg.caption || tg.message && tg.message.caption)) || "").match(/^\/(\w+)/)?.[1] || "").replace(/^\//, ""),
        user: tg && tg.from && tg.from.id,
        sock: api,
        client: api,
        telegram: api,
        api,
        Utils: fmt,
        setting: settings,
        Config: config,
        DB: getDB(),
        db: (() => { try { return host.db ? host.db().get() : null; } catch { return null; } })(),
        usage,
        fmt
      };
      for (const [key, value] of Object.entries(overrides)) {
        try {
          Object.defineProperty(pctx, key, { value, writable: true, enumerable: true, configurable: true });
        } catch {  }
      }
      if (typeof pctx.reply !== "function") {
        pctx.reply = () => Promise.resolve();
      }
      const missing = missingRequired(named);
      if (missing.length) {
        return await tg.reply(fmt.texted("bold", "Missing required") + ": " + missing.map((o: any) => o.name).join(", ") + "\n*Usage:* /" + usage());
      }
      return run(pctx);
    }
  };
  if ((m as any).defaultMemberPermissions !== undefined) phase["default_member_permissions"] = (m as any).defaultMemberPermissions;
  return phase;
}
