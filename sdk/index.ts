import * as text from "./text.js";
import * as telegram from "./telegram.js";
import * as discord from "./discord.js";
import * as voice from "./voice.js";
import * as discordVoice from "./discordVoice.js";
import * as whatsapp from "./whatsapp.js";
import * as core from "./core.js";
import * as anti from "./common/anti.js";
import * as converter from "./common/converter.js";
import * as cooldown from "./common/cooldown.js";
import * as permission from "./common/permission.js";
import * as proxy from "./common/proxy.js";
import * as queue from "./common/queue.js";
import { define, defineBot } from "./define.js";
import { Platform } from "./platform-class.js";
import * as verify from "./verify.js";
import * as menu from "./menu.js";
import * as runtime from "./runtime.js";
import * as i18n from "./i18n.js";
import * as scheduler from "./scheduler.js";
import * as antidelete from "./antidelete.js";
import * as buttons from "./buttons.js";
import * as wizard from "./wizard.js";
import * as session from "./session.js";
import * as airich from "./airich.js";
import * as sessions from "./sessions.js";
import * as cards from "./cards.js";
import * as configModule from "./config.js";
import { loadConfig } from "./config.js";

const common = { anti, converter, cooldown, permission, proxy, queue };

export function createPlatform(kind: string, opts: { iconsDir?: string } = {}): { kind: string } & Record<string, unknown> {
  const k = String(kind || "").toLowerCase();
  if (k === "telegram" || k === "tg") return Object.assign({ kind: "telegram" }, telegram);
  if (k === "discord" || k === "dc") {
    if (opts.iconsDir) discord.icons(opts.iconsDir);
    return Object.assign({ kind: "discord" }, discord);
  }
  throw new Error("Unknown platform: " + kind + " (use telegram or discord).");
}

const PlatformAny = Platform as any;
PlatformAny.createPlatform = createPlatform;
PlatformAny.define = define;
PlatformAny.text = text;
PlatformAny.telegram = telegram;
PlatformAny.discord = discord;
PlatformAny.voice = voice;
PlatformAny.discordVoice = discordVoice;
PlatformAny.whatsapp = whatsapp;
PlatformAny.core = core;
PlatformAny.common = common;
PlatformAny.verify = verify;
PlatformAny.menu = menu;
PlatformAny.runtime = runtime;
PlatformAny.i18n = i18n;
PlatformAny.scheduler = scheduler;
PlatformAny.antidelete = antidelete;
PlatformAny.buttons = buttons;
PlatformAny.wizard = wizard;
PlatformAny.session = session;
PlatformAny.airich = airich;
PlatformAny.sessions = sessions;
PlatformAny.cards = cards;
PlatformAny.config = configModule;

export { Platform, define, defineBot, text, telegram, discord, voice, discordVoice, whatsapp, core, common, verify, menu, runtime, i18n, scheduler, antidelete, buttons, wizard, session, airich, sessions, cards, loadConfig };
export const dcvoice = discordVoice;
export const config = configModule;
export type * from "./whatsapp.js";
export type * from "./verify.js";
export type * from "./menu.js";
export type * from "./runtime.js";
export type * from "./define.js";
export type * from "./platform-class.js";
export type * from "./common/permission.js";
export type * from "./text.js";
