import { need, needAsync } from "../sdk/loader.js";
import { tap } from "../sdk/whatsapp.js";

let cached: Promise<any> | null = null;

async function baileys(): Promise<any> {
  if (!cached) {
    cached = (async () => {
      try {
        return need("@whiskeysockets/baileys");
      } catch {
        return needAsync("baileys");
      }
    })();
  }
  return cached;
}

export function defaultBotFn(id: unknown): boolean {
  const s = String(id || "");
  return s.startsWith("BAE5") || s.indexOf("-") > 1;
}

export async function smsg(sock: any, m: any, ctx: any = {}): Promise<any> {
  const B = await baileys();
  const M = B.proto.WebMessageInfo;
  if (!m) return m;
  m = M.fromObject(m);
  const botFn = ctx.botFn || defaultBotFn;
  const decode = (s: string) => {
    try {
      if (sock && typeof sock.decodeJid === "function") return sock.decodeJid(s);
      if (B && typeof B.jidNormalizedUser === "function") return B.jidNormalizedUser(s);
      if (B && typeof B.jidDecode === "function") {
        const d = B.jidDecode(s);
        if (d && d.user) return d.user + "@" + (d.server || "s.whatsapp.net");
      }
    } catch {  }
    return s;
  };
  const sameJid = (a: string, b: string) => {
    try {
      if (B && typeof B.areJidsSameUser === "function") return B.areJidsSameUser(a, b);
    } catch {  }
    return a === b;
  };
  const isGroupJid = (j: unknown) => {
    try {
      if (B && typeof B.isJidGroup === "function" && typeof j === "string") return B.isJidGroup(j);
    } catch {  }
    return typeof j === "string" && (j as string).endsWith("@g.us");
  };
  const isStatusJid = (j: unknown) => {
    try {
      if (B && typeof B.isJidStatusBroadcast === "function" && typeof j === "string") return B.isJidStatusBroadcast(j);
    } catch {  }
    return j === "status@broadcast";
  };
  if (m.key) {
    m.id = m.key.id;
    m.isBaileys = botFn(m.id);
    m.chat = decode(m.key.remoteJid || (m.message && m.message.senderKeyDistributionMessage && m.message.senderKeyDistributionMessage.groupId) || "");
    m.isGroup = isGroupJid(m.chat);
    m.sender = decode((m.key.fromMe && sock.user && sock.user.id) || m.participant || m.key.participant || m.chat || "");
    try {
      m.fromMe = m.key.fromMe || (B.areJidsSameUser ? B.areJidsSameUser(m.sender, sock.user.id) : m.sender === sock.user.id);
    } catch {
      m.fromMe = !!m.key.fromMe;
    }
  }
  if (m.message) {
    const mtype: string[] = Object.keys(m.message);
    m.mtype =
      !["senderKeyDistributionMessage", "messageContextInfo"].includes(mtype[0]) && mtype[0] ||
      (mtype.length >= 3 && mtype[1] !== "messageContextInfo" && mtype[1]) ||
      mtype[mtype.length - 1];
    m.msg = m.message[m.mtype];
    if (isStatusJid(m.chat) && ["protocolMessage", "senderKeyDistributionMessage"].includes(m.mtype)) {
      m.chat = (m.key.remoteJid !== "status@broadcast" && m.key.remoteJid) || m.sender;
    }
    if (m.mtype === "protocolMessage" && m.msg.key) {
      if (isStatusJid(m.msg.key.remoteJid)) m.msg.key.remoteJid = m.chat;
      if (!m.msg.key.participant || m.msg.key.participant === "status_me") m.msg.key.participant = m.sender;
      try {
        m.msg.key.fromMe = sameJid(decode(m.msg.key.participant), decode(sock.user.id));
      } catch {  }
      if (!m.msg.key.fromMe && sameJid(m.msg.key.remoteJid, decode(sock.user.id))) m.msg.key.remoteJid = m.sender;
    }
    m.text = (m.msg && (m.msg.text || m.msg.caption || m.msg.contentText)) || m.msg || "";
    if (typeof m.text !== "string") {
      if (["protocolMessage", "messageContextInfo", "stickerMessage", "audioMessage", "senderKeyDistributionMessage"].includes(m.mtype)) {
        m.text = "";
      } else {
        m.text = m.text.selectedDisplayText || (m.text.hydratedTemplate && m.text.hydratedTemplate.hydratedContentText) || m.text;
      }
    }
    try {
      const tapId = tap(m.message);
      if (tapId) {
        m.text = tapId;
        m.tapId = tapId;
      }
    } catch {  }
    m.mentionedJid =
      (m.msg && m.msg.contextInfo && m.msg.contextInfo.mentionedJid && m.msg.contextInfo.mentionedJid.length && m.msg.contextInfo.mentionedJid) || [];
    const forwardInfo = (m.msg && m.msg.contextInfo) || {};
    m.isForwarded = forwardInfo.isForwarded === true || Number(forwardInfo.forwardingScore) > 0;
    m.forwardScore = Number(forwardInfo.forwardingScore) || 0;
    const quoted = (m.quoted =
      m.msg && m.msg.contextInfo && m.msg.contextInfo.quotedMessage ? m.msg.contextInfo.quotedMessage : null);
    if (m.quoted) {
      const type = Object.keys(m.quoted)[0];
      m.quoted = m.quoted[type];
      if (typeof m.quoted === "string") m.quoted = { text: m.quoted };
      m.quoted.mtype = type;
      m.quoted.id = m.msg.contextInfo.stanzaId;
      m.quoted.chat = decode(m.msg.contextInfo.remoteJid || m.chat || m.sender);
      m.quoted.sender = decode(m.msg.contextInfo.participant || m.chat);
      m.quoted.fromMe = sameJid(m.quoted.sender, (sock.user && sock.user.id) || "");
      m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.contentText || "";
      try {
        m.quoted.name = sock.getName ? sock.getName(m.quoted.sender) : m.quoted.sender;
      } catch {
        m.quoted.name = m.quoted.sender;
      }
      m.quoted.mentionedJid =
        (m.quoted.contextInfo && m.quoted.contextInfo.mentionedJid && m.quoted.contextInfo.mentionedJid.length && m.quoted.contextInfo.mentionedJid) || [];
      const vM = (m.quoted.fakeObj = M.fromObject({
        key: { fromMe: m.quoted.fromMe, remoteJid: m.quoted.chat, id: m.quoted.id },
        message: quoted,
        ...(m.isGroup ? { participant: m.quoted.sender } : {})
      }));
      m.getQuotedObj = m.getQuotedMessage = async () => {
        if (!m.quoted.id) return null;
        let q = null;
        try {
          if (ctx.store && ctx.store.loadMessage) q = await ctx.store.loadMessage(m.chat, m.quoted.id);
        } catch {  }
        return smsg(sock, M.fromObject(q || vM), ctx);
      };
      if (m.quoted.url || m.quoted.directPath) {
        m.quoted.download = (save?: string) => sock.downloadM(m.quoted, m.quoted.mtype.replace(/message/i, ""), save);
      }
      m.quoted.reply = (text: unknown, chatId?: string, options?: unknown) => sock.reply(chatId ? chatId : m.chat, text, vM, options);
      m.quoted.copy = () => smsg(sock, M.fromObject(M.toObject(vM)), ctx);
      m.quoted.forward = (jid: string, force?: boolean) => sock.forwardMessage(jid, vM, force === true);
      m.quoted.copyNForward = (jid: string, force?: boolean, options: unknown = {}) => sock.copyNForward(jid, vM, force !== false, options || {});
      m.quoted.delete = () => sock.sendMessage(m.quoted.chat, { delete: vM.key });
    }
  }
  try {
    m.name = m.pushName || (sock.getName ? sock.getName(m.sender) : m.sender);
  } catch {
    m.name = m.pushName || m.sender;
  }
  if (m.msg && m.msg.url) {
    m.download = (save?: string) => sock.downloadM(m.msg, m.mtype.replace(/message/i, ""), save);
  }
  m.copy = () => smsg(sock, M.fromObject(M.toObject(m)), ctx);
  m.forward = (jid: string, force?: boolean, options?: unknown) => sock.copyNForward(jid || m.chat, m, force === true, options || {});
  m.reply = async (text: unknown, options?: any) => {
    try {
      if (options && typeof options === "object" && (options.image || options.video || options.audio || options.document || options.sticker)) {
        return sock.sendFile(m.chat, options, null, text, m);
      }
      return sock.reply(m.chat, text == null ? options : text, m);
    } catch {
      return sock.reply(m.chat, text, m);
    }
  };
  m.react = async (emoji: string) => sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
  m.copyNForward = (jid: string, force?: boolean, options?: unknown) => sock.copyNForward(jid || m.chat, m, force !== false, options || {});
  m.delete = () => sock.sendMessage(m.chat, { delete: m.key });
  try {
    if (m.msg && m.mtype === "protocolMessage" && ctx.emit) {
      ctx.emit("message.delete", m.msg.key);
    }
  } catch {  }
  return m;
}

export function serializeM(sock: any, m: any, ctx?: any): Promise<any> {
  return smsg(sock, m, ctx);
}
