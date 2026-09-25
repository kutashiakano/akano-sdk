import * as B from "@whiskeysockets/baileys";
import fs from "node:fs";
import crypto from "node:crypto";
import FileType from "file-type";
import PhoneNumber from "awesome-phonenumber";
import { sticker, resize as sdkResize } from "./common/converter.js";
import { proxyFetch } from "./common/proxy.js";

const isUrl = (s: any): boolean => typeof s === "string" && new RegExp("^https?://", "i").test(s);

function waUploadOf(sock: any): any {
  return sock.waUp || sock.waUploadToServer || sock.upload;
}

function parseMentionOf(sock: any, text: any): string[] {
  if (sock.parseMention) return sock.parseMention(text);
  if (!text || typeof text !== "string") return [];
  return [...text.matchAll(new RegExp("@([0-9]{5,16}|0)", "g"))].map((v: any) => v[1] + "@s.whatsapp.net");
}

function headerOf(): string {
  return (globalThis as any).header || "© Akano-Bot";
}

function stickerMeta(): { packname: string; author: string } {
  const g: any = globalThis as any;
  return {
    packname: g.settings?.media?.sticker?.packname || "Akano",
    author: g.settings?.media?.sticker?.author || "Bot"
  };
}

async function fetchBuf(url: string): Promise<Buffer> {
  try {
    const res = await proxyFetch(url);
    if (!res.ok) return Buffer.alloc(0);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return Buffer.alloc(0);
  }
}

async function thumbOf(sock: any, source: any): Promise<any> {
  try {
    if (!source) return null;
    if (sock && typeof sock.resize === "function") return await sock.resize(source, 300, 300);
    return await sdkResize(source, 300, 300);
  } catch {
    return null;
  }
}

async function mediaBuf(input: any): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string" && new RegExp("^data:.*?/.*?;base64,", "i").test(input)) {
    try {
      return Buffer.from(input.split(",")[1], "base64");
    } catch {
      return Buffer.alloc(0);
    }
  }
  if (typeof input === "string" && isUrl(input)) return await fetchBuf(input);
  if (typeof input === "string") {
    try {
      if (fs.existsSync(input)) return fs.readFileSync(input);
    } catch {}
  }
  return Buffer.alloc(0);
}

export async function sendMessageModify(sock: any, jid: string, text: string, msg: any, options: any = {}): Promise<any> {
  const { largeThumb = false, thumbnail = "", url = "", body = "", title = "", ads = false, isForwarded = false, type } = options;
  if (type === "preview-link") {
    const rawThumb = url || thumbnail || "";
    const thumbToUse = isUrl(rawThumb) ? rawThumb : (url || "");
    const messageOptions: any = {
      text,
      contextInfo: {
        mentionedJid: parseMentionOf(sock, text),
        isForwarded,
        externalAdReply: {
          showAdAttribution: !!ads,
          title: title || headerOf(),
          body: body || null,
          sourceUrl: url || "",
          mediaType: 1,
          renderLargerThumbnail: !!largeThumb,
          thumbnailUrl: isUrl(thumbToUse) ? thumbToUse : undefined,
          thumbnail: !isUrl(thumbToUse) && thumbnail ? thumbnail : undefined,
          mediaUrl: "https://telegra.ph/?id=" + crypto.randomBytes(4).toString("hex")
        }
      },
      ...(url ? { matchedText: url } : {})
    };
    return await sock.sendMessage(jid, messageOptions, { quoted: msg });
  }
  const messageOptions: any = {
    text,
    contextInfo: {
      mentionedJid: parseMentionOf(sock, text),
      isForwarded
    }
  };
  const thumbUrl = url || (isUrl(thumbnail) ? thumbnail : "");
  messageOptions.contextInfo.externalAdReply = {
    showAdAttribution: !!ads,
    title: title || headerOf(),
    body: body || null,
    sourceUrl: url || "",
    mediaType: 1,
    renderLargerThumbnail: !!largeThumb,
    thumbnailUrl: isUrl(thumbUrl) ? thumbUrl : url ? url : undefined,
    thumbnail: !isUrl(thumbUrl) && thumbnail && !url ? thumbnail : undefined,
    mediaUrl: "https://telegra.ph/?id=" + crypto.randomBytes(4).toString("hex")
  };
  return await sock.sendMessage(jid, messageOptions, { quoted: msg });
}

export async function sendMessageVerify(sock: any, jid: string, text: string, fakeName: any = "© Akano-Bot", options: any = {}, useAdReply = false, extra: any = {}, ephemeral: any = {}): Promise<any> {
  let jpegThumb: any = null;
  try {
    if (options && options.thumbnail) jpegThumb = await thumbOf(sock, options.thumbnail);
  } catch {}
  let quotedFake: any;
  if (useAdReply && fakeName && typeof fakeName === "object" && (fakeName as any).key) {
    quotedFake = fakeName;
  } else if (useAdReply && (fakeName === null || (fakeName && typeof fakeName === "object"))) {
    quotedFake = fakeName;
  } else {
    const locName = typeof fakeName === "string" ? (fakeName || "© Akano-Bot") : (options.title || "© Akano-Bot");
    quotedFake = {
      key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        ...(jid ? { remoteJid: "status@broadcast" } : {})
      },
      message: {
        locationMessage: {
          name: locName,
          jpegThumbnail: jpegThumb || undefined
        }
      },
      expiration: 0
    };
  }
  if (useAdReply) {
    const { largeThumb = false, thumbnail = "", url = "", body = "", title = "", ads = false, isForwarded = false } = options;
    const messageOptions: any = {
      text,
      contextInfo: {
        mentionedJid: parseMentionOf(sock, text),
        isForwarded,
        externalAdReply: {
          showAdAttribution: !!ads,
          title: title || (typeof fakeName === "string" ? fakeName : "") || headerOf(),
          body: body || null,
          sourceUrl: url || "",
          mediaType: 1,
          renderLargerThumbnail: !!largeThumb,
          thumbnailUrl: isUrl(thumbnail) ? thumbnail : url || undefined,
          thumbnail: !isUrl(thumbnail) && thumbnail ? thumbnail : undefined,
          mediaUrl: "https://telegra.ph/?id=" + crypto.randomBytes(4).toString("hex")
        }
      },
      ...extra
    };
    return await sock.sendMessage(jid, messageOptions, { quoted: quotedFake });
  }
  return await sock.sendMessage(jid, {
    text,
    mentions: parseMentionOf(sock, text),
    ...options
  }, {
    quoted: quotedFake,
    ...ephemeral
  });
}

export async function sendMessageModifyV2(sock: any, jid: string, text: string, fakeTitle: any, options: any = {}, extra: any = {}): Promise<any> {
  return sendMessageVerify(sock, jid, text, fakeTitle, options, true, extra);
}

export async function sendMessageVerifyV2(sock: any, jid: string, text: string, fakeName: any = "© Akano-Bot", options: any = {}): Promise<any> {
  return sendMessageVerify(sock, jid, text, fakeName, options);
}

export async function sendProgress(sock: any, jid: string, text: string, quoted: any, options: any = {}): Promise<any> {
  const steps = ["⬢⬡⬡⬡⬡⬡⬡⬡⬡⬡ 10%", "⬢⬢⬢⬡⬡⬡⬡⬡⬡⬡ 30%", "⬢⬢⬢⬢⬢⬡⬡⬡⬡⬡ 50%", "⬢⬢⬢⬢⬢⬢⬢⬢⬢⬢ 100%", text];
  try {
    const msg: any = await sock.sendMessage(jid, { text: "⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡ 0%" }, { quoted });
    if (!msg || !msg.key) return msg;
    for (const c of steps) {
      await sock.delay(800);
      try {
        await sock.sendMessage(jid, { text: c, edit: msg.key });
      } catch {
        try {
          await sock.relayMessage(jid, {
            protocolMessage: {
              key: msg.key,
              type: 14,
              editedMessage: { conversation: c }
            }
          }, {});
        } catch {}
      }
    }
    return msg;
  } catch {
    return await sock.sendMessage(jid, { text }, { quoted });
  }
}

export async function sndAlb(sock: any, jid: string, medias: any[], options: any = {}): Promise<any> {
  if (typeof jid !== "string") throw new TypeError("jid must be string, received: " + jid);
  const normalized = (medias || []).map((m: any) => {
    if (m.url && !m.data) {
      return {
        type: m.type || (new RegExp("\\.(mp4|mov|avi)$", "i").test(m.url) ? "video" : "image"),
        data: { url: m.url },
        caption: m.caption || ""
      };
    }
    if (m.data && m.data.url) {
      return { type: m.type, data: m.data, caption: m.caption || "" };
    }
    if (Buffer.isBuffer(m.data) || Buffer.isBuffer(m.url)) {
      return {
        type: m.type || "image",
        data: Buffer.isBuffer(m.data) ? m.data : m.url,
        caption: m.caption || ""
      };
    }
    return m;
  });
  for (const media of normalized) {
    if (!media.type || (media.type !== "image" && media.type !== "video")) {
      throw new TypeError("medias[i].type must be 'image' or 'video'");
    }
    if (!media.data || (!media.data.url && !Buffer.isBuffer(media.data) && typeof media.data !== "string")) {
      throw new TypeError("medias[i].data must be object with url or buffer");
    }
  }
  if (normalized.length < 2) throw new RangeError("Minimum 2 media");
  const caption = options.text || options.caption || "";
  const delay = !isNaN(options.delay) ? options.delay : 500;
  const quoted = options.quoted || options.quotedMessage || null;
  delete options.text;
  delete options.caption;
  delete options.delay;
  delete options.quoted;
  delete options.quotedMessage;
  const waUp = waUploadOf(sock);
  const album: any = await B.generateWAMessageFromContent(jid, {
    messageContextInfo: { messageSecret: new Uint8Array(crypto.randomBytes(32)) },
    albumMessage: {
      expectedImageCount: normalized.filter((media: any) => media.type === "image").length,
      expectedVideoCount: normalized.filter((media: any) => media.type === "video").length,
      ...(quoted && quoted.message ? {
        contextInfo: {
          remoteJid: quoted.key.remoteJid,
          fromMe: quoted.key.fromMe,
          stanzaId: quoted.key.id,
          participant: quoted.key.participant || quoted.key.remoteJid,
          quotedMessage: quoted.message || ""
        }
      } : {})
    }
  } as any, {});
  await sock.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id });
  for (const i in normalized) {
    const { type, data, caption: cap } = normalized[i];
    const useCaption = i === "0" ? caption || cap || "" : cap || "";
    const img: any = await B.generateWAMessage(album.key.remoteJid, {
      [type]: typeof data === "object" && data.url ? data : data,
      ...(useCaption ? { caption: useCaption } : {})
    } as any, { upload: waUp } as any).catch(() => null);
    if (!img || !img.message) continue;
    img.message.messageContextInfo = {
      messageSecret: new Uint8Array(crypto.randomBytes(32)),
      messageAssociation: { associationType: 1, parentMessageKey: album.key }
    };
    await sock.relayMessage(img.key.remoteJid, img.message, { messageId: img.key.id });
    await sock.delay(delay);
  }
  return album;
}

export { sndAlb as sendAlbumMessage };
export { sndAlb as sendAlbum };

export async function sendVideoAsSticker(sock: any, jid: string, pathData: any, quoted: any, options: any = {}, ephemeral: any = {}): Promise<any> {
  const buff = await mediaBuf(pathData);
  if (!buff || buff.length === 0) throw new Error("Invalid media for sendVideoAsSticker");
  const meta = stickerMeta();
  const buffer = await sticker(buff, {
    packname: options.packname || meta.packname,
    author: options.author || meta.author,
    categories: options.categories || [""]
  } as any);
  const sendOpts = { ...options };
  delete sendOpts.packname;
  delete sendOpts.author;
  delete sendOpts.categories;
  await sock.sendMessage(jid, { sticker: buffer, ...sendOpts }, { quoted, ...ephemeral });
  return buffer;
}

export async function sendContact(sock: any, jid: string, data: any, quoted: any, options: any = {}, ephemeral: any = {}): Promise<any> {
  let contactsInput: any[] = [];
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && !Array.isArray(data[0])) {
    contactsInput = data.map((c: any) => [c.number || c.phone || c.id, c.name || c.displayName, c.about || c.status || ""]);
  } else if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0] === "string") {
    contactsInput = data;
  } else if (Array.isArray(data) && typeof data[0] === "string" && typeof data[1] === "string") {
    contactsInput = [data];
  } else {
    contactsInput = data;
  }
  const org = options.org || "Akano Network";
  const website = options.website || "https://akano.my.id";
  const email = options.email || "contact@akano.my.id";
  const contacts: any[] = [];
  for (const entry of contactsInput) {
    let number: any;
    let name: any;
    let about: any;
    if (Array.isArray(entry)) {
      [number, name, about] = entry;
    } else if (typeof entry === "object" && entry !== null) {
      number = entry.number || entry.phone;
      name = entry.name;
      about = entry.about;
    }
    if (!number || !name) continue;
    number = String(number).replace(new RegExp("[^0-9]", "g"), "");
    const njid = number + "@s.whatsapp.net";
    let biz: any = {};
    try {
      biz = await sock.getBusinessProfile(njid).catch(() => null) || {};
    } catch {}
    let displayPhone: string;
    try {
      displayPhone = (PhoneNumber as any)("+" + number).getNumber("international") || "+" + number;
    } catch {
      displayPhone = "+" + number;
    }
    const esc = (s: any) => String(s == null ? "" : s).replace(new RegExp("\\n", "g"), "\\n");
    let vcard = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(name), "ORG:" + esc(org), "TEL;type=CELL;type=VOICE;waid=" + number + ":" + displayPhone, "EMAIL;type=Email:" + esc(email), "URL;type=Website:" + esc(website), "ADR;type=Location:;;Unknown;;", "NOTE:" + esc(about || biz.description || ""), "END:VCARD"].join("\n");
    try {
      const ppUrl = await sock.profilePictureUrl(njid, "image").catch(() => null);
      if (ppUrl) {
        const imgBuf = await fetchBuf(ppUrl);
        if (imgBuf && imgBuf.length > 0) {
          vcard = vcard.replace("END:VCARD", "PHOTO;BASE64:" + imgBuf.toString("base64") + "\nEND:VCARD");
        }
      }
    } catch {}
    if (biz.description) {
      vcard = vcard.replace("END:VCARD", "X-WA-BIZ-DESCRIPTION:" + esc(biz.description) + "\nX-WA-BIZ-NAME:" + esc(name) + "\nEND:VCARD");
    }
    contacts.push({ displayName: name, vcard });
  }
  if (contacts.length === 0) throw new Error("No valid contacts");
  return sock.sendMessage(jid, {
    ...options,
    contacts: {
      ...options,
      displayName: (contacts.length >= 2 ? contacts.length + " contacts" : contacts[0].displayName) || null,
      contacts
    }
  }, {
    quoted,
    ...options,
    ...ephemeral
  });
}

export async function pollResult(sock: any, jid: string, pollData: any, quoted: any, options: any = {}): Promise<any> {
  const name = pollData.name || pollData.title || "Poll Result";
  const votes = (pollData.votes || pollData.options || []).map((v: any) => ({
    name: v.name || v.optionName || v.text || "",
    voteCount: parseInt(v.count ?? v.voteCount ?? v.votes ?? 0, 10)
  }));
  const content: any = {
    pollResult: {
      name,
      votes: votes.map((v: any) => ({ name: v.name, voteCount: v.voteCount })),
      pollType: pollData.pollType || 0
    }
  };
  try {
    const msg: any = await B.generateWAMessage(jid, content, { upload: waUploadOf(sock), ...options });
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch {
    let txt = "*" + name + "*\n";
    votes.forEach((v: any, i: number) => {
      txt += (i + 1) + ". " + v.name + ": " + v.voteCount + " votes\n";
    });
    return await sock.sendMessage(jid, { text: txt.trim() }, { quoted });
  }
}

export async function sendPtv(sock: any, jid: string, media: any, quoted: any, options: any = {}): Promise<any> {
  const buffer = await mediaBuf(media);
  return await sock.sendMessage(jid, { video: buffer, ptv: true, ...options }, { quoted });
}

export async function copyNForward(sock: any, jid: string, msg: any, forceForward = false, options: any = {}): Promise<any> {
  if (options.readViewOnce) {
    const vtype = msg.message.viewOnceMessage?.message;
    const ptype = msg.message.viewOnceMessageV2?.message;
    delete msg.message.viewOnceMessage;
    delete msg.message.viewOnceMessageV2;
    msg.message = vtype || ptype || msg.message;
  }
  const mtype = Object.keys(msg.message)[0];
  const cMsg: any = (B.proto as any).Message.fromObject(msg.message);
  const content = cMsg[mtype];
  if (typeof content === "string") cMsg[mtype] = content;
  else if (content.contextInfo) cMsg[mtype].contextInfo = content.contextInfo;
  if (forceForward) cMsg[mtype].contextInfo = {
    ...(cMsg[mtype].contextInfo || {}),
    forwardingScore: forceForward ? 1 : 0,
    isForwarded: true
  };
  await sock.relayMessage(jid, { [mtype]: cMsg }, { messageId: msg.key.id, ...options });
  return msg;
}

export async function downloadAndSaveMediaMessage(sock: any, message: any, filename: string, attachExtension = true): Promise<string> {
  const quoted = message.msg ? message.msg : message;
  const mime = (message.msg || message).mimetype || "";
  const messageType = message.mtype ? message.mtype.replace(new RegExp("Message", "gi"), "") : mime.split("/")[0];
  const stream = await B.downloadContentFromMessage(quoted, messageType as any);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
  }
  const type: any = await (FileType as any).fromBuffer(buffer).catch(() => null);
  const trueFileName = attachExtension ? filename + "." + ((type && type.ext) || "bin") : filename;
  await fs.promises.writeFile(trueFileName, buffer);
  return trueFileName;
}

export async function groupStatus(sock: any, jid: string, content: any, options: any = {}): Promise<any> {
  const waUp = waUploadOf(sock);
  let msgContent: any = {};
  const isPrivate = !!options.private;
  if (content && content.key && content.message) {
    const mtype = Object.keys(content.message)[0];
    const inner = content.message[mtype];
    try {
      const msg: any = await B.generateWAMessage(jid, {
        [mtype.replace("Message", "").toLowerCase()]: inner,
        groupStatus: jid
      } as any, { upload: waUp } as any);
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
      return msg;
    } catch {
      await sock.relayMessage(jid, content.message, { messageId: content.key.id });
      return content;
    }
  }
  if (content && content.message && typeof content.message === "object" && !content.key) {
    const keys = Object.keys(content.message);
    const first = keys[0];
    if (first && first.endsWith("Message")) {
      msgContent = { ...content.message, groupStatus: jid };
      if (content.caption && msgContent[first]) msgContent[first].caption = content.caption;
    } else {
      msgContent = { ...content, groupStatus: jid };
      delete msgContent.message;
      Object.assign(msgContent, content.message);
    }
    if (isPrivate) msgContent.groupStatus = jid;
  } else if (content && content.media) {
    const media = content.media;
    const caption = content.caption || "";
    let buffer: Buffer;
    if (Buffer.isBuffer(media)) buffer = media;
    else if (isUrl(media)) buffer = await fetchBuf(media);
    else {
      try {
        buffer = fs.existsSync(media) ? fs.readFileSync(media) : Buffer.alloc(0);
      } catch {
        buffer = Buffer.alloc(0);
      }
    }
    let mime = "";
    try {
      const type: any = await (FileType as any).fromBuffer(buffer).catch(() => null);
      mime = type?.mime || "";
    } catch {}
    if (new RegExp("image").test(mime)) {
      msgContent = { image: buffer, caption, groupStatus: jid };
    } else if (new RegExp("video").test(mime)) {
      msgContent = { video: buffer, caption, groupStatus: jid };
    } else if (new RegExp("audio").test(mime)) {
      msgContent = { audio: buffer, mimetype: "audio/mpeg", ptt: false, groupStatus: jid };
      if (content.background) msgContent.backgroundColor = content.background;
    } else {
      msgContent = { image: buffer, caption, groupStatus: jid };
    }
    if (content.background) msgContent.backgroundColor = content.background;
  } else if (content && content.text) {
    msgContent = { text: content.text, groupStatus: jid };
    if (content.background) msgContent.backgroundColor = content.background;
    if (content.color) msgContent.backgroundColor = content.color;
    if (content.font) msgContent.font = content.font;
  } else if (typeof content === "string") {
    msgContent = { text: content, groupStatus: jid };
    if (options.background) msgContent.backgroundColor = options.background;
  } else if (content && (content.background || content.color)) {
    msgContent = {
      text: content.text || content.caption || "Hi!",
      groupStatus: jid,
      backgroundColor: content.background || content.color
    };
  } else {
    msgContent = { text: String(content || "Hi!"), groupStatus: jid };
  }
  if (msgContent.backgroundColor && typeof msgContent.backgroundColor === "string") {
    const hex = msgContent.backgroundColor.trim().replace("#", "");
    const num = parseInt(hex.length <= 6 ? "FF" + hex.padStart(6, "0") : hex, 16);
    if (!isNaN(num)) msgContent.backgroundColor = num;
  }
  if (isPrivate) {
    try {
      const statusJid = "status@broadcast";
      const msg: any = await B.generateWAMessage(statusJid, msgContent, { upload: waUp } as any);
      if (options.private) {
        const attr = options.private;
        msg.message.messageContextInfo = msg.message.messageContextInfo || {};
        msg.message.messageContextInfo.statusAttribution = {
          type: 1,
          groupStatus: { groupJid: jid, attributionTag: attr.emoji || "🔥" }
        };
      }
      await sock.relayMessage(statusJid, msg.message, { messageId: msg.key.id, statusJidList: [jid] });
      return msg;
    } catch {}
  }
  try {
    const msg: any = await B.generateWAMessage(jid, msgContent, { upload: waUp } as any);
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (e) {
    try {
      const msg2: any = await B.generateWAMessage("status@broadcast", msgContent, { upload: waUp } as any);
      await sock.relayMessage("status@broadcast", msg2.message, { messageId: msg2.key.id, statusJidList: [jid] });
      return msg2;
    } catch {
      throw e;
    }
  }
}
