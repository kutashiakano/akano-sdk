import crypto from "node:crypto";

const UNIQUE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const STATUS: Record<string, string> = {
  PENDING: "pending",
  VERIFIED: "verified",
  EXPIRED: "expired",
  FAILED: "failed",
  APPROVED: "approved"
};

export type VerificationStatus = string;

export interface VerificationRecord {
  userJid: string;
  groupJid: string;
  captcha: string | null;
  question: string | null;
  answer: string | null;
  attempts: number;
  createdAt: number;
  expiresAt: number;
  status: string;
  cptId: string | null;
}

export interface VerifierConfig {
  enabled?: boolean;
  captchaLength?: number;
  expiresIn?: number;
  maxAttempts?: number;
}

export interface VerifierOptions {
  config?: VerifierConfig;
  state?: Record<string, VerificationRecord>;
  chats?: Record<string, Record<string, unknown>> | ((jid: string) => Record<string, unknown>);
  save?: () => Promise<unknown>;
  logError?: (tag: string, err: unknown) => void;
  fetchGroupMetadata?: (groupJid: string, sock: SockLike) => Promise<any>;
}

interface SockLike {
  decodeJid: (jid: string) => string;
  sendMessage: (jid: string, content: unknown) => Promise<{ key?: { id?: string } }>;
  reply: (chat: string, text: string, msg?: unknown) => Promise<unknown>;
  groupRequestParticipantsUpdate?: (group: string, users: string[], action: string) => Promise<{ status?: unknown }[]>;
  findUserId?: (jid: string) => Promise<{ phoneNumber?: string } | null>;
  [key: string]: any;
}

interface JoinRequest {
  id?: string;
  participant?: string;
  action?: string;
}

interface ReplyMessage {
  fromMe?: boolean;
  quoted?: { id?: string } | null;
  text?: string;
  sender?: string;
  chat?: string;
}

export function generateCaptcha(length?: number): string {
  const len = Number(length) > 0 ? Number(length) : 6;
  const max = Math.floor(256 / UNIQUE_CHARS.length) * UNIQUE_CHARS.length;
  let code = "";
  while (code.length < len) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < max) code += UNIQUE_CHARS[byte % UNIQUE_CHARS.length];
  }
  return code;
}

function formatCaptchaMessage(code: string, minutes: number): string {
  return "Verification\n\n" + `Code: ${code}\n\n` + "Reply to this message with the code above.\n\n" + `Valid for ${minutes} minutes.`;
}

function formatQuestionMessage(question: string, minutes: number): string {
  return "Verification\n\n" + `Question: ${question}\n\n` + "Reply to this message with the answer above.\n\n" + `Valid for ${minutes} minutes.`;
}

export interface Verifier {
  onJoinRequest: (sock: SockLike, update: JoinRequest) => Promise<void>;
  handleReply: (sock: SockLike, m: ReplyMessage) => Promise<boolean>;
  sweepExpired: () => boolean;
  state: Record<string, VerificationRecord>;
  config: Required<VerifierConfig>;
  STATUS: typeof STATUS;
}

export function createVerifier(opts: VerifierOptions = {}): Verifier {
  const config: Required<VerifierConfig> = Object.assign(
    { enabled: true, captchaLength: 6, expiresIn: 300000, maxAttempts: 3 },
    opts.config || {}
  );
  const state: Record<string, VerificationRecord> = opts.state || {};
  const chats = opts.chats || {};
  const getChat = typeof chats === "function" ? chats : (jid: string) => (chats as Record<string, Record<string, unknown>>)[jid] || {};
  const save = typeof opts.save === "function" ? opts.save : async () => {};
  const logError = typeof opts.logError === "function" ? opts.logError : () => {};
  const fetchGroupMetadata = typeof opts.fetchGroupMetadata === "function" ? opts.fetchGroupMetadata : null;
  let sweeperStarted = false;

  function stateKey(groupJid: string, userJid: string): string {
    return `whatsapp:${groupJid}:${userJid}`;
  }

  function findStateKeyByCaptchaMessageId(messageId: string | undefined): string | null {
    if (!messageId) return null;
    for (const key of Object.keys(state)) {
      if (state[key] && state[key].cptId === messageId) return key;
    }
    return null;
  }

  function lidMappingOf(sock: SockLike): any {
    try {
      const repo = (sock as any).signalRepository;
      if (repo && repo.lidMapping) return repo.lidMapping;
    } catch {}
    return null;
  }

  async function pnForLid(sock: SockLike, jid: string): Promise<string | null> {
    try {
      const mapping = lidMappingOf(sock);
      if (mapping && typeof mapping.getPNForLID === "function") {
        const pn = await mapping.getPNForLID(jid);
        if (typeof pn === "string" && pn.includes("@")) return pn;
      }
    } catch {}
    return null;
  }

  async function lidForPn(sock: SockLike, jid: string): Promise<string | null> {
    try {
      const mapping = lidMappingOf(sock);
      if (mapping && typeof mapping.getLIDForPN === "function") {
        const lid = await mapping.getLIDForPN(jid);
        if (typeof lid === "string" && lid.includes("@")) return lid;
      }
    } catch {}
    return null;
  }

  async function resolveToPhoneJid(sock: SockLike, jid: string): Promise<string> {
    jid = sock.decodeJid(jid);
    if (!jid || !jid.endsWith("@lid")) return jid;
    try {
      const pn = await pnForLid(sock, jid);
      if (pn) return pn;
    } catch {}
    if (typeof sock.findUserId !== "function") return jid;
    try {
      const info = await sock.findUserId(jid);
      if (info && typeof info.phoneNumber === "string" && info.phoneNumber.includes("@")) return info.phoneNumber;
    } catch {}
    return jid;
  }

  async function sameUser(sock: SockLike, a: string, b: string): Promise<boolean> {
    a = sock.decodeJid(a);
    b = sock.decodeJid(b);
    if (!a || !b) return false;
    if (a === b) return true;
    try {
      const lidA = a.endsWith("@lid") ? a : await lidForPn(sock, a);
      const lidB = b.endsWith("@lid") ? b : await lidForPn(sock, b);
      if (lidA && lidB && lidA === lidB) return true;
      if (lidA && lidA === b) return true;
      if (lidB && lidB === a) return true;
    } catch {}
    if (a.endsWith("@lid") || b.endsWith("@lid")) {
      try {
        const resolvedA = await resolveToPhoneJid(sock, a);
        const resolvedB = await resolveToPhoneJid(sock, b);
        return resolvedA === resolvedB || a === resolvedB || resolvedA === b;
      } catch {
        return false;
      }
    }
    return false;
  }

  function sweepExpired(): boolean {
    const now = Date.now();
    let changed = false;
    for (const key of Object.keys(state)) {
      const verification = state[key];
      if (!verification || typeof verification !== "object") {
        delete state[key];
        changed = true;
        continue;
      }
      const isTerminal = [STATUS.VERIFIED, STATUS.APPROVED, STATUS.FAILED, STATUS.EXPIRED].includes(verification.status as VerificationStatus);
      const isStale = now > (verification.expiresAt || 0) + (config.expiresIn || 0);
      if (isTerminal || (verification.status === STATUS.PENDING && isStale)) {
        delete state[key];
        changed = true;
      }
    }
    if (changed) save().catch(() => {});
    return changed;
  }

  function startSweeper(): void {
    if (sweeperStarted) return;
    sweeperStarted = true;
    const timer = setInterval(() => {
      try {
        sweepExpired();
      } catch {}
    }, 300000);
    if (typeof timer.unref === "function") timer.unref();
  }

  async function onJoinRequest(sock: SockLike, update: JoinRequest): Promise<void> {
    startSweeper();
    if (!config.enabled) return;
    const { id, participant, action } = update || {};
    const groupJid = sock.decodeJid(id || "");
    if (!groupJid || typeof groupJid !== "string" || !groupJid.endsWith("@g.us")) return;
    if (!participant || typeof participant !== "string") return;
    let userJid = sock.decodeJid(participant);
    if (!userJid.includes("@")) return;
    let userLid: string | null = userJid.endsWith("@lid") ? userJid : null;
    try {
      if (!userLid) userLid = await lidForPn(sock, userJid);
    } catch {}
    try {
      if (userJid.endsWith("@lid")) {
        const pn = await pnForLid(sock, userJid);
        if (pn) userJid = pn;
      }
    } catch {}
    try {
      const metadata = fetchGroupMetadata ? await fetchGroupMetadata(groupJid, sock) : await (sock as any).groupMetadata(groupJid);
      const found = metadata?.participants?.find(
        (u: any) =>
          (typeof u.id === "string" && sock.decodeJid(u.id) === userJid) ||
          (typeof u.lid === "string" && u.lid === userJid) ||
          (typeof u.lid === "string" && userLid !== null && (u.lid === userLid || sock.decodeJid(u.lid) === userLid)) ||
          (typeof u.phoneNumber === "string" && (u.phoneNumber === userJid || sock.decodeJid(u.phoneNumber) === userJid))
      );
      if (found && typeof found.phoneNumber === "string" && found.phoneNumber.includes("@")) userJid = found.phoneNumber;
    } catch {}
    const key = stateKey(groupJid, userJid);
    if (action === "revoked" || action === "rejected") {
      if (state[key]) {
        delete state[key];
        await save().catch(() => {});
      }
      return;
    }
    if (action !== "created") return;
    const chat = getChat(groupJid);
    if (chat.verification === false) return;
    if (state[key] && [STATUS.PENDING, STATUS.VERIFIED].includes(state[key].status)) return;
    const useQuestion =
      typeof chat.verifQuestion === "string" &&
      (chat.verifQuestion as string).trim() &&
      typeof chat.verifAnswer === "string" &&
      (chat.verifAnswer as string).trim();
    const captcha = useQuestion ? null : generateCaptcha(config.captchaLength);
    const verification: VerificationRecord = {
      userJid,
      groupJid,
      captcha,
      question: useQuestion ? (chat.verifQuestion as string).trim() : null,
      answer: useQuestion ? (chat.verifAnswer as string).trim() : null,
      attempts: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + config.expiresIn,
      status: STATUS.PENDING,
      cptId: null
    };
    state[key] = verification;
    try {
      const minutes = Math.max(1, Math.round(config.expiresIn / 60000));
      const text = useQuestion
        ? formatQuestionMessage((chat.verifQuestion as string).trim(), minutes)
        : formatCaptchaMessage(captcha as string, minutes);
      const sent = await sock.sendMessage(userJid, { text });
      verification.cptId = (sent && sent.key && sent.key.id) || null;
      if (!verification.cptId) {
        delete state[key];
        await save().catch(() => {});
        return;
      }
      await save().catch(() => {});
    } catch (e) {
      delete state[key];
      await save().catch(() => {});
      logError("verify.send", e);
    }
  }

  async function handleReply(sock: SockLike, m: ReplyMessage): Promise<boolean> {
    if (!config.enabled) return false;
    if (m.fromMe) return false;
    if (!m.quoted || typeof m.quoted.id !== "string") return false;
    const key = findStateKeyByCaptchaMessageId(m.quoted.id);
    if (!key) return false;
    const verification = state[key];
    if (!verification) return false;
    if (!(await sameUser(sock, m.sender || "", verification.userJid))) return false;
    if (!(await sameUser(sock, m.chat || "", verification.userJid))) return false;
    if ([STATUS.VERIFIED, STATUS.APPROVED].includes(verification.status)) return true;
    if (verification.status !== STATUS.PENDING) return true;
    const chat = getChat(verification.groupJid);
    if (chat.verification === false) return true;
    if (Date.now() > verification.expiresAt) {
      delete state[key];
      await save().catch(() => {});
      await sock.reply(m.chat || "", "Verification expired.\n\nPlease send a new join request to get a new code.", m).catch(() => {});
      return true;
    }
    const answer = (m.text || "").trim();
    if (!answer) return true;
    const expected = verification.question ? String(verification.answer || "").trim() : verification.captcha;
    if (answer.toLowerCase() !== (expected || "").toLowerCase()) {
      verification.attempts += 1;
      if (verification.attempts >= config.maxAttempts) {
        delete state[key];
        await save().catch(() => {});
        await sock.reply(m.chat || "", "Verification failed.\n\nYou have run out of attempts.", m).catch(() => {});
      } else {
        await save().catch(() => {});
        await sock
          .reply(m.chat || "", `Wrong code.\n\nAttempt: ${verification.attempts}/${config.maxAttempts}\nPlease reply to the verification message with the correct code.`, m)
          .catch(() => {});
      }
      return true;
    }
    verification.status = STATUS.VERIFIED;
    await save().catch(() => {});
    let approved = false;
    try {
      if (typeof sock.groupRequestParticipantsUpdate === "function") {
        const result = await sock.groupRequestParticipantsUpdate(verification.groupJid, [verification.userJid], "approve");
        approved = Array.isArray(result) && result.every((r) => r && String(r.status) === "200");
      }
    } catch (e) {
      approved = false;
      logError("verify.approve", e);
    }
    delete state[key];
    await save().catch(() => {});
    await sock
      .reply(m.chat || "", approved ? "Verification successful.\n\nYour join request has been approved." : "Verification failed.\n\nPlease send a new join request to get a new code.", m)
      .catch(() => {});
    return true;
  }

  return { onJoinRequest, handleReply, sweepExpired, state, config, STATUS };
}
