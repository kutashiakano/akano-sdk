export interface SpamOptions {
  mode?: string;
  messageLimit?: number;
  timeWindowSeconds?: number;
  commandCooldownSeconds?: number;
  cooldownSeconds?: number;
  banCooldownSeconds?: number;
  maxBanTimes?: number;
  banDecayTime?: number;
}

export interface SpamCheck {
  ok: boolean;
  banned: boolean;
  retryAfterMs: number;
  count: number;
}

interface BanInfo {
  until: number;
  count: number;
}

export class Spam {
  mode: string;
  messageLimit: number;
  timeWindowSeconds: number;
  commandCooldownSeconds: number;
  cooldownSeconds: number;
  banCooldownSeconds: number;
  maxBanTimes: number;
  banDecayTime: number;
  hits = new Map<string, number[]>();
  cooldowns = new Map<string, number>();
  bans = new Map<string, BanInfo>();

  constructor(opts: SpamOptions = {}) {
    this.mode = opts.mode || "command";
    this.messageLimit = opts.messageLimit || 5;
    this.timeWindowSeconds = opts.timeWindowSeconds || 10;
    this.commandCooldownSeconds = opts.commandCooldownSeconds || 3;
    this.cooldownSeconds = opts.cooldownSeconds || 5;
    this.banCooldownSeconds = opts.banCooldownSeconds || 300;
    this.maxBanTimes = opts.maxBanTimes || 3;
    this.banDecayTime = opts.banDecayTime || 3600;
  }

  prune(id: string, now: number): number[] {
    const list = (this.hits.get(id) || []).filter((t) => now - t <= this.timeWindowSeconds * 1000);
    this.hits.set(id, list);
    return list;
  }

  check(userId: string | number, command?: string): SpamCheck {
    const now = Date.now();
    const id = String(userId) + ":" + String(command || "*");
    const ban = this.bans.get(String(userId));
    if (ban && now < ban.until) {
      return { ok: false, banned: true, retryAfterMs: ban.until - now, count: ban.count };
    }
    if (ban && now >= ban.until) this.bans.delete(String(userId));
    const cdKey = this.mode === "command" ? id : String(userId);
    const cdUntil = this.cooldowns.get(cdKey) || 0;
    if (now < cdUntil) {
      return { ok: false, banned: false, retryAfterMs: cdUntil - now, count: 0 };
    }
    const gap = (this.mode === "command" ? this.commandCooldownSeconds : this.cooldownSeconds) * 1000;
    const list = this.prune(id, now);
    list.push(now);
    this.hits.set(id, list);
    this.cooldowns.set(cdKey, now + gap);
    if (list.length > this.messageLimit) {
      const uid = String(userId);
      const prev = this.bans.get(uid);
      const count = (prev && prev.count + 1) || 1;
      const over = count >= this.maxBanTimes;
      this.bans.set(uid, { until: now + (over ? this.banDecayTime : this.banCooldownSeconds) * 1000, count });
      return { ok: false, banned: true, retryAfterMs: (over ? this.banDecayTime : this.banCooldownSeconds) * 1000, count };
    }
    return { ok: true, banned: false, retryAfterMs: 0, count: list.length };
  }
}

export default Spam;
