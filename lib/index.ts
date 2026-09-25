import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as Func from "./function.js";
import * as Scraper from "./scraper.js";
import * as Exif from "./exif.js";
import * as Converter from "./converter.js";
import { Spam } from "./spam.js";
import { Database } from "./database.js";
import * as sdk from "../sdk/index.js";
import * as voip from "./voip/index.js";
import { DiscordVoice } from "../sdk/discordVoice.js";
import * as authModule from "./auth.js";

const Platform = sdk.Platform;

function loadConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf8"));
  } catch {
    return {};
  }
}

export {
  Func as Function,
  Scraper,
  Exif,
  Converter,
  Spam,
  Database,
  Platform,
  DiscordVoice,
  sdk
};
export const callFor = voip.callFor;
export const VoiceCall = voip.VoiceCall;
export const define = sdk.define;
export const createPlatform = sdk.createPlatform;
export const verify = sdk.verify;
export const menu = sdk.menu;
export const runtime = sdk.runtime;
export const i18n = sdk.i18n;
export const scheduler = sdk.scheduler;
export const antidelete = sdk.antidelete;
export const buttons = sdk.buttons;
export const wizard = sdk.wizard;
export const session = sdk.session;
export const airich = sdk.airich;
export const sessions = sdk.sessions;
export const cards = sdk.cards;
export const common = sdk.common;
export const core = sdk.core;
export const text = sdk.text;
export const telegram = sdk.telegram;
export const discord = sdk.discord;
export const whatsapp = sdk.whatsapp;
export { Cooldown, SpamDetection } from "../sdk/common/cooldown.js";
export { Queue } from "../sdk/common/queue.js";
export { isLink, isVirtex, extractLinks, AntiDelete } from "../sdk/common/anti.js";
export { Notifier, getPermission, isOwner, isPremium, isAdmin, isBotAdmin } from "../sdk/common/permission.js";
export { getProxyUrl, normalizeProxyUrl, shouldProxy, getProxyAgent, createProxyAgent, getFetchAgent, proxyFetch } from "../sdk/common/proxy.js";
export { resize, toAudio, toPTT, toVideo, ffmpeg, addExif, makeExif, runFfmpeg, runFfprobe, isReadableStream, saveStreamToFile, getSpawnEnv } from "../sdk/common/converter.js";
export { texted, status, userCard, spaced, formatNumber, esc, bold, sizeLimit, matcher, formatSize, cap, example, TG_PHOTO_MAX, TG_UPLOAD_MAX, toTime, generateLink, socmed } from "../sdk/core.js";
export { Esc, chop, keyboard, presence, typing, sendRetry, answerTap, sendReact, mediaFile, isConflict, classifyError } from "../sdk/telegram.js";
export { card, button, actionRow, watch, clear, attach, thumb, meter, clock, md } from "../sdk/discord.js";
export { send, forward, reply, poll, file, sticker, react, mention, delay, download, media } from "../sdk/whatsapp.js";
export { sanitize, splitSmart, stripMd } from "../sdk/text.js";
export { AIRichBuilder } from "../sdk/airich.js";
export { ui } from "../sdk/discord.js";
export { defineBot } from "../sdk/define.js";
export { smsg, serializeM } from "./serialize.js";
export { sendMessageModify, sendMessageModifyV2, sendMessageVerify, sendMessageVerifyV2, sendProgress, sndAlb, sendAlbumMessage, sendAlbum, sendVideoAsSticker, sendContact, pollResult, sendPtv, groupStatus, copyNForward, downloadAndSaveMediaMessage } from "../sdk/senders.js";
export const auth = authModule;
export const Config = loadConfig();
export type * from "../sdk/index.js";
export type { ConnectionOptions, ConnectionPlugin } from "./connection.js";
export default {
  Function: Func,
  Scraper,
  Exif,
  Converter,
  Spam,
  Database,
  Platform,
  DiscordVoice,
  callFor: voip.callFor,
  VoiceCall: voip.VoiceCall,
  define: sdk.define,
  createPlatform: sdk.createPlatform,
  verify: sdk.verify,
  menu: sdk.menu,
  runtime: sdk.runtime,
  i18n: sdk.i18n,
  scheduler: sdk.scheduler,
  antidelete: sdk.antidelete,
  buttons: sdk.buttons,
  wizard: sdk.wizard,
  session: sdk.session,
  airich: sdk.airich,
  sessions: sdk.sessions,
  cards: sdk.cards,
  auth: authModule,
  sdk,
  Config: loadConfig()
};
