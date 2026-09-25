export interface TrackedMessage {
  id: string;
  chat: string;
  sender: string;
  text: string;
  mtype: string;
  at: number;
  raw: unknown;
}

export interface MessageEvents {
  on: (evt: string, fn: (data: any) => void) => unknown;
}

export class AntiDeleteStore {
  private items = new Map<string, TrackedMessage>();
  private max: number;

  constructor(max = 500) {
    this.max = max > 0 ? max : 500;
  }

  track(msg: TrackedMessage): void {
    if (!msg || !msg.id) return;
    if (!this.items.has(msg.id) && this.items.size >= this.max) {
      const first = this.items.keys().next().value;
      if (first !== undefined) this.items.delete(first);
    }
    this.items.set(msg.id, msg);
  }

  resolve(keyOrId: unknown): TrackedMessage | null {
    const id = typeof keyOrId === "string" ? keyOrId : (keyOrId as { id?: string })?.id;
    if (!id) return null;
    return this.items.get(String(id)) || null;
  }

  forget(id: string): boolean {
    return this.items.delete(String(id));
  }

  clear(chat?: string): number {
    if (!chat) {
      const n = this.items.size;
      this.items.clear();
      return n;
    }
    let n = 0;
    for (const [id, m] of this.items) {
      if (m.chat === chat) {
        this.items.delete(id);
        n++;
      }
    }
    return n;
  }

  get size(): number {
    return this.items.size;
  }
}

export function trackFromSerialized(m: any): TrackedMessage | null {
  if (!m || !m.key || !m.key.id) return null;
  return {
    id: String(m.key.id),
    chat: String(m.chat || m.key.remoteJid || ""),
    sender: String(m.sender || m.key.participant || ""),
    text: String(m.text || ""),
    mtype: String(m.mtype || ""),
    at: Date.now(),
    raw: m
  };
}

export function watchAntiDelete(
  conn: MessageEvents,
  fn: (deleted: TrackedMessage, key: unknown) => void,
  store: AntiDeleteStore = new AntiDeleteStore()
): AntiDeleteStore {
  conn.on("import", (payload: any) => {
    try {
      const tracked = trackFromSerialized(payload && payload.m);
      if (tracked) store.track(tracked);
    } catch {}
  });
  conn.on("message.delete", (key: any) => {
    try {
      const stored = store.resolve(key);
      if (stored) {
        store.forget(stored.id);
        fn(stored, key);
      }
    } catch {}
  });
  return store;
}

export interface DiscordDeletedMessage {
  id: string;
  chat: string;
  author: string;
  text: string;
  raw: unknown;
}

export function watchAntiDeleteDiscord(
  client: { on: (evt: string, fn: (msg: any) => void) => unknown },
  fn: (deleted: DiscordDeletedMessage) => void
): void {
  client.on("messageDelete", (msg: any) => {
    try {
      if (!msg || msg.author?.bot) return;
      fn({
        id: String(msg.id || ""),
        chat: String(msg.channel?.id || ""),
        author: String(msg.author?.id || ""),
        text: String(msg.content || msg.cleanContent || ""),
        raw: msg
      });
    } catch {}
  });
}
