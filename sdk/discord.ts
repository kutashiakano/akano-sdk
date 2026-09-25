import fs from "node:fs";
import path from "node:path";
import { need } from "./loader.js";

let iconsDir: string | null = null;

export function icons(dir?: string | null): string | null {
  if (dir !== undefined) iconsDir = dir || null;
  return iconsDir;
}

export function engine(): any {
  return need("discord.js");
}

export function card(): any {
  return new (engine().EmbedBuilder)();
}

export function button(id: string, label: string, style?: unknown): any {
  const b = engine();
  return new (b.ButtonBuilder)().setCustomId(id).setLabel(label).setStyle(style || b.ButtonStyle.Primary);
}

export function actionRow(buttons: unknown[]): any {
  const r = new (engine().ActionRowBuilder)();
  r.addComponents(...(buttons || []));
  return r;
}

export async function watch(msg: any, filter: (...args: any[]) => boolean, ms: number, onEnd?: any, extra?: any): Promise<any> {
  let endCb: any = null;
  let opts: any = {};
  if (typeof onEnd === "function") endCb = onEnd;
  else if (onEnd && typeof onEnd === "object") opts = onEnd;
  if (typeof extra === "function") {
    if (!opts.collect && !opts.onCollect) opts = { ...opts, collect: extra };
  } else if (extra && typeof extra === "object") opts = { ...opts, ...extra };
  if (!endCb && typeof opts.onEnd === "function") endCb = opts.onEnd;
  let collectCb: any = null;
  if (typeof opts.collect === "function") collectCb = opts.collect;
  else if (typeof opts.onCollect === "function") collectCb = opts.onCollect;
  const cfg: any = { filter, time: ms };
  if (opts.componentType !== undefined) cfg.componentType = opts.componentType;
  if (opts.max !== undefined) cfg.max = opts.max;
  if (opts.idle !== undefined) cfg.idle = opts.idle;
  let col = null;
  try {
    col = msg.createMessageComponentCollector(cfg);
  } catch {
    return null;
  }
  if (collectCb) col.on("collect", (...args: any[]) => {
    try {
      collectCb(...args);
    } catch {  }
  });
  if (endCb) col.on("end", () => {
    try {
      endCb(msg);
    } catch {  }
  });
  return col;
}

export function clear(msg: any): void {
  try {
    msg.edit({ components: [] }).catch(() => {});
  } catch {  }
}

const iconCache: Record<string, Buffer> = {};

export function attach(name: string, dir?: string): { attachment: Buffer; name: string }[] {
  const d = dir || iconsDir;
  if (!d) return [];
  const key = d + "|" + name;
  if (!iconCache[key]) {
    try {
      iconCache[key] = fs.readFileSync(path.join(d, name + ".png"));
    } catch {
      return [];
    }
  }
  return [{ attachment: iconCache[key], name: name + ".png" }];
}

export function thumb(name: string, embed: any, dir?: string): { attachment: Buffer; name: string }[] {
  const f = attach(name, dir);
  if (f.length) {
    try {
      embed.setThumbnail("attachment://" + name + ".png");
    } catch {  }
    return f;
  }
  return [];
}

export function meter(cur: number, max: number, len: number): string {
  const n = Math.max(0, Math.min(len, Math.round((cur / max) * len)));
  return "[" + "#".repeat(n) + "-".repeat(len - n) + "] " + cur + "/" + max;
}

export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + (s % 60) + "s";
  return s + "s";
}

export function md(src: unknown): string {
  let s = String(src == null ? "" : src);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, p) => "```\n" + String(p).trim() + "\n```");
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, p) => "`" + String(p).trim() + "`");
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, p) => "```\n" + String(p).trim() + "\n```");
  s = s.replace(/\[([^\]\n[]+)\]\(\s*\)/g, "$1");
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
  s = balance(s, "```");
  s = balance(s, "**");
  s = balance(s, "~~");
  s = balance(s, "||");
  s = balance(s, "`");
  return s;
}

export function chop(text: unknown, maxLength?: number): string[] {
  const s = String(text == null ? "" : text);
  const m = maxLength || 1900;
  if (s.length <= m) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > m) {
    out.push(rest.slice(0, m));
    rest = rest.slice(m);
  }
  out.push(rest);
  return out;
}

export async function typing(target: any): Promise<unknown> {
  try {
    const channel = target && target.channel ? target.channel : target;
    if (channel && channel.sendTyping) return await channel.sendTyping().catch(() => {});
  } catch {  }
  return undefined;
}

export async function thinking(interaction: any, ephemeral?: boolean): Promise<unknown> {
  if (!ephemeral) return interaction.deferReply({});
  try {
    const b = engine();
    const flags = b && b.MessageFlags ? b.MessageFlags.Ephemeral : undefined;
    if (flags !== undefined) return interaction.deferReply({ flags });
  } catch {  }
  return interaction.deferReply({ ephemeral: true });
}

export async function editReply(target: any, content: unknown): Promise<unknown> {
  return target.editReply(content);
}

export async function followUp(target: any, content: unknown): Promise<unknown> {
  return target.followUp(content);
}

export function poll(question: any, answers: any, opts?: any): any {
  let b: any = null;
  try {
    b = engine();
  } catch {
    b = null;
  }
  let Builder: any = null;
  try {
    Builder = b ? b.PollBuilder : null;
  } catch {
    Builder = null;
  }
  if (!Builder) throw new Error("PollBuilder is not available in this discord.js version.");
  const p = new Builder();
  if (typeof question === "string") p.setQuestion({ text: question });
  else if (question) p.setQuestion(question);
  const list = (Array.isArray(answers) ? answers : [answers]).map((a: any) => typeof a === "string" ? { text: a } : a);
  if (p.addAnswers) p.addAnswers(list);
  else if (p.setAnswers) p.setAnswers(list);
  else if (p.addAnswer) for (const a of list) p.addAnswer(a);
  if (opts && typeof opts === "object") {
    if (opts.duration !== undefined && p.setDuration) p.setDuration(opts.duration);
    const multi = opts.multiselect !== undefined ? opts.multiselect : opts.multi;
    if (multi !== undefined && p.setAllowMultiselect) p.setAllowMultiselect(!!multi);
  }
  return p;
}

export interface DiscordAttachment {
  url: string;
  contentType: string;
  name: string;
  size: number;
}

export interface DiscordMessage {
  platform: "discord";
  chatId: string;
  guildId: string;
  userId: string;
  username: string;
  text: string;
  messageId: string | null;
  referenceId: string | null;
  attachments: DiscordAttachment[];
  raw: unknown;
  reply: (content: unknown) => Promise<unknown>;
  react: (emoji: string) => Promise<unknown>;
  editReply: (content: unknown) => Promise<unknown>;
  followUp: (content: unknown) => Promise<unknown>;
  thread: (name: string, autoArchive?: number) => Promise<unknown>;
}

export function readMsg(message: any): DiscordMessage {
  const atts: DiscordAttachment[] = [];
  try {
    const col = message.attachments;
    const list = col ? (col.map ? col.map((a: unknown) => a) : [...col.values()]) : [];
    for (const a of list) {
      if (a && a.url) atts.push({ url: a.url, contentType: a.contentType || "", name: a.name || "", size: a.size || 0 });
    }
  } catch {  }
  return {
    platform: "discord",
    chatId: String((message.channel && message.channel.id) || ""),
    guildId: String((message.guild && message.guild.id) || ""),
    userId: String((message.author && message.author.id) || ""),
    username: (message.author && message.author.username) || "User",
    text: String(message.content || ""),
    messageId: message.id || null,
    referenceId: (message.reference && message.reference.messageId) || null,
    attachments: atts,
    raw: message,
    reply: (content) => message.reply(content),
    react: (emoji) => message.react(emoji).catch(() => {}),
    editReply: (content) => message.edit ? message.edit(content) : Promise.resolve(null),
    followUp: (content) => message.channel && message.channel.send ? message.channel.send(content) : message.reply(content),
    thread: (name, autoArchive) => {
      if (message.startThread) return message.startThread({ name, autoArchiveDuration: autoArchive || 1440 });
      return Promise.resolve(null);
    }
  };
}
