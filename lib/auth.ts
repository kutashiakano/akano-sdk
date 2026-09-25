import { Database } from "./database.js";
import { need } from "../sdk/loader.js";

export type AuthProtocol = "json" | "sqlite" | "mongodb" | "redis" | "mysql" | "pg";

export interface AuthState {
  creds: unknown;
  keys: {
    get: (type: string, ids: string[]) => Promise<Record<string, unknown>>;
    set: (data: Record<string, Record<string, unknown>>) => Promise<void>;
  };
}

export interface AuthHandle {
  state: AuthState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
  readonly creds: unknown;
  readonly keys: unknown;
}

function baileys(): any {
  try {
    return need("baileys");
  } catch {
    return need("@whiskeysockets/baileys");
  }
}

export async function createAuthState(databaseUrl?: string | null, name = "auth"): Promise<AuthHandle> {
  const B = baileys();
  if (typeof B.initAuthCreds !== "function" || !B.BufferJSON) {
    throw new Error("Baileys auth helpers are not available.");
  }
  const { initAuthCreds, BufferJSON } = B;
  const { database } = Database.create(databaseUrl || null, name);
  let stored: any = {};
  try {
    const raw = (await database.fetch().catch(() => ({}))) || {};
    stored = JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
  } catch {
    stored = {};
  }
  let creds: unknown = stored.creds;
  let keys: Record<string, Record<string, unknown>> = stored.keys || {};
  if (!creds || typeof creds !== "object") {
    creds = initAuthCreds();
    keys = {};
    await database.save({ creds, keys }).catch(() => {});
  }

  async function persist(): Promise<void> {
    await database.save({ creds, keys }).catch(() => {});
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const out: Record<string, unknown> = {};
          const store = keys[type] || {};
          for (const id of ids) {
            const raw = store[id];
            if (raw === undefined) continue;
            try {
              out[id] = BufferJSON.reviver(id, raw);
            } catch {
              out[id] = raw;
            }
          }
          return out;
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          for (const type of Object.keys(data || {})) {
            keys[type] = keys[type] || {};
            for (const id of Object.keys(data[type] || {})) {
              const value = data[type][id];
              try {
                keys[type][id] = value === undefined ? value : JSON.parse(JSON.stringify(value, BufferJSON.replacer));
              } catch {
                keys[type][id] = value;
              }
            }
          }
          await persist();
        }
      }
    },
    saveCreds: persist,
    clear: async () => {
      creds = initAuthCreds();
      keys = {};
      await persist();
    },
    get creds() {
      return creds;
    },
    get keys() {
      return keys;
    }
  };
}

export function authUrl(protocol: AuthProtocol, target: string): string {
  const p = String(protocol || "json").toLowerCase();
  if (p === "json" || !target) return "";
  if (/:\/\//.test(target)) return target;
  if (p === "sqlite") return `sqlite://${target}`;
  return `${p}://${target}`;
}
