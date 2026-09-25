export interface SpamOptions {
  RESET_TIMER?: number;
  HOLD_TIMER?: number;
  HOLD_THRESHOLD?: number;
  PERM_T?: number;
  NOT_T?: number;
  BAN_T?: number;
}

export interface SpamRecord {
  hits: number[];
  state: string | null;
  msg: string;
}

export class Cooldown {
  private cooldowns = new Map<string, number>();
  private ms: number;

  constructor(ms = 5000) {
    this.ms = ms;
  }

  get(userId: string, command: string): number {
    const cd = this.cooldowns.get(`${userId}:${command}`);
    if (!cd) return 0;
    const remaining = cd - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  set(userId: string, command: string, ms?: number): void {
    this.cooldowns.set(`${userId}:${command}`, Date.now() + (ms || this.ms));
  }

  has(userId: string, command: string): boolean {
    return this.get(userId, command) > 0;
  }
}

export class SpamDetection {
  private records = new Map<string, SpamRecord>();
  private RESET_TIMER: number;
  private HOLD_TIMER: number;
  private HOLD_THRESHOLD: number;
  private PERM_T: number;
  private NOT_T: number;
  private BAN_T: number;

  constructor(opts: SpamOptions = {}) {
    this.RESET_TIMER = opts.RESET_TIMER || 5000;
    this.HOLD_TIMER = opts.HOLD_TIMER || 60000;
    this.HOLD_THRESHOLD = opts.HOLD_THRESHOLD || 5;
    this.PERM_T = opts.PERM_T || 10;
    this.NOT_T = opts.NOT_T || 3;
    this.BAN_T = opts.BAN_T || 15;
  }

  detection(userId: string, _opts: Record<string, unknown> = {}): SpamRecord {
    const now = Date.now();
    let record = this.records.get(userId);
    if (!record) {
      record = { hits: [], state: null, msg: "" };
      this.records.set(userId, record);
    }
    record.hits.push(now);
    record.hits = record.hits.filter((t) => now - t <= this.RESET_TIMER);
    const count = record.hits.length;
    if (count >= this.BAN_T) {
      record.state = "BANNED";
      record.msg = "You are permanently banned for spamming.";
      return record;
    }
    if (count >= this.PERM_T) {
      record.state = "PERMANENT";
      record.msg = `Spam detected (${count}x). Permanently limited.`;
      return record;
    }
    if (count >= this.HOLD_THRESHOLD) {
      record.state = "HOLD";
      record.msg = `Slow down! ${count} commands in ${this.RESET_TIMER / 1000}s.`;
      return record;
    }
    if (count >= this.NOT_T) {
      record.state = "NOTIFY";
      record.msg = `Warning: ${count} commands in ${this.RESET_TIMER / 1000}s.`;
      return record;
    }
    record.state = "OK";
    record.msg = "";
    return record;
  }

  isBanned(userId: string): boolean {
    const record = this.records.get(userId);
    return !!record && record.state === "BANNED";
  }

  clear(userId: string): void {
    this.records.delete(userId);
  }
}
