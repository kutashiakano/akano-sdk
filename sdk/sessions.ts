import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Platform, type PlatformOptions } from "./platform-class.js";

export class SessionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export type AccountStatus = "stopped" | "starting" | "online" | "offline" | "loggedOut";

export interface AccountInfo {
  id: string;
  status: AccountStatus;
  phoneNumber: string;
  updatedAt: number;
}

export interface CreateAccountOptions extends PlatformOptions {
  phoneNumber?: string;
  pairingCode?: string;
  forceRecreate?: boolean;
  clearSession?: boolean;
}

export interface SessionsOptions {
  dir?: string;
  onEvent?: (accountId: string, evt: string, data: unknown) => void;
}

const REQUIRED_CREDS = ["noiseKey", "pairingEphemeralKeyPair", "signedIdentityKey", "signedPreKey"];

export function validateSession(dir: string): { valid: boolean; reason?: string } {
  const file = path.join(dir, "creds.json");
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { valid: false, reason: "missing creds.json" };
  }
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "corrupt creds.json" };
  }
  if (creds.registered !== true) return { valid: false, reason: "not registered" };
  for (const key of REQUIRED_CREDS) {
    if (creds[key] === undefined || creds[key] === null) return { valid: false, reason: `missing ${key}` };
  }
  return { valid: true };
}

export class Sessions extends EventEmitter {
  readonly dir: string;
  private accounts = new Map<string, { api: Platform; info: AccountInfo; stopWatcher?: () => void }>();
  private onEvent?: (accountId: string, evt: string, data: unknown) => void;

  constructor(opts: SessionsOptions = {}) {
    super();
    this.dir = opts.dir || "./sessions";
    this.onEvent = opts.onEvent;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch {}
  }

  loadAll(): string[] {
    try {
      return fs
        .readdirSync(this.dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  info(id: string): AccountInfo | null {
    return this.accounts.get(String(id))?.info || null;
  }

  allInfo(): AccountInfo[] {
    return [...this.accounts.values()].map((a) => ({ ...a.info }));
  }

  socket(id: string): unknown {
    const acc = this.accounts.get(String(id));
    if (!acc) throw new SessionError(`Account not found: ${id}`, "ACCOUNT_NOT_FOUND");
    return acc.api.client;
  }

  async create(id: string, opts: CreateAccountOptions = {}): Promise<Platform> {
    const accountId = String(id);
    const existing = this.accounts.get(accountId);
    if (existing) {
      const check = validateSession(path.join(this.dir, accountId));
      if (check.valid && !opts.forceRecreate && existing.info.status === "online") return existing.api;
      await this.stop(accountId).catch(() => {});
      if (opts.clearSession) {
        try {
          fs.rmSync(path.join(this.dir, accountId), { recursive: true, force: true });
        } catch {}
      }
    }
    const sessionPath = path.join(this.dir, accountId);
    const api = new Platform({
      plugins_dir: "./plugins",
      session_dir: sessionPath,
      platform: opts.platform || "whatsapp",
      pairing: opts.pairing || (opts.phoneNumber ? { state: true, number: opts.phoneNumber, code: opts.pairingCode } : { state: false, number: "" }),
      ...opts
    } as PlatformOptions);
    const info: AccountInfo = { id: accountId, status: "starting", phoneNumber: opts.phoneNumber || "", updatedAt: Date.now() };
    const emit = (evt: string, data: unknown) => {
      try {
        this.emit(evt, { accountId, data });
        this.onEvent?.(accountId, evt, data);
      } catch {}
    };
    api.on("ready", (x) => emit("ready", x));
    api.on("connect", () => {
      info.status = "online";
      info.updatedAt = Date.now();
      emit("connect", { ...info });
    });
    api.on("error", (x: any) => {
      const msg = String((x && x.message) || x || "");
      if (/logged out/i.test(msg)) {
        info.status = "loggedOut";
        info.updatedAt = Date.now();
      } else if (info.status !== "online") {
        info.status = "offline";
        info.updatedAt = Date.now();
      }
      emit("error", x);
    });
    this.accounts.set(accountId, { api, info });
    await api.start().catch((e) => {
      throw new SessionError(`Connect failed for ${accountId}: ` + ((e as Error)?.message || e), "CONNECT_FAILED");
    });
    return api;
  }

  async stop(id: string): Promise<boolean> {
    const accountId = String(id);
    const acc = this.accounts.get(accountId);
    if (!acc) return false;
    try {
      const client = acc.api.client as { close?: () => Promise<unknown> } | null;
      if (client && typeof client.close === "function") await client.close();
    } catch {}
    acc.info.status = "stopped";
    acc.info.updatedAt = Date.now();
    this.accounts.delete(accountId);
    return true;
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.accounts.keys()]) await this.stop(id).catch(() => {});
  }
}

export function createSessions(opts: SessionsOptions = {}): Sessions {
  return new Sessions(opts);
}
