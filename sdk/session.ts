export interface SessionOptions {
  defaults?: Record<string, unknown> | ((id: string) => Record<string, unknown>);
  load?: (id: string) => Promise<Record<string, unknown> | null | undefined>;
  save?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
}

export interface UserSession {
  id: string;
  data: Record<string, unknown>;
  save: () => Promise<void>;
  clear: () => Promise<void>;
}

export function createSession(opts: SessionOptions = {}): {
  get: (id: string) => Promise<Record<string, unknown>>;
  set: (id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
  session: (id: string) => Promise<UserSession>;
  clear: (id: string) => Promise<boolean>;
} {
  const memory = new Map<string, Record<string, unknown>>();
  const blanks = opts.defaults || {};

  async function read(id: string): Promise<Record<string, unknown>> {
    const key = String(id);
    if (!memory.has(key)) {
      let data: Record<string, unknown> = typeof blanks === "function" ? blanks(key) : { ...(blanks as Record<string, unknown>) };
      try {
        const stored = await opts.load?.(key);
        if (stored && typeof stored === "object") data = Object.assign({}, data, stored);
      } catch {}
      memory.set(key, data);
    }
    return memory.get(key) as Record<string, unknown>;
  }

  async function write(id: string, data: Record<string, unknown>): Promise<void> {
    const key = String(id);
    memory.set(key, data);
    try {
      await opts.save?.(key, data);
    } catch {}
  }

  return {
    get: read,
    set: async (id: string, patch: Record<string, unknown>) => {
      const data = Object.assign(await read(id), patch || {});
      await write(id, data);
      return data;
    },
    session: async (id: string): Promise<UserSession> => {
      const key = String(id);
      return {
        id: key,
        data: await read(key),
        save: async () => {
          await write(key, (await read(key)) || {});
        },
        clear: async () => {
          memory.delete(key);
          try {
            await opts.save?.(key, {});
          } catch {}
        }
      };
    },
    clear: async (id: string) => {
      const key = String(id);
      const had = memory.has(key);
      memory.delete(key);
      try {
        await opts.save?.(key, {});
      } catch {}
      return had;
    }
  };
}
