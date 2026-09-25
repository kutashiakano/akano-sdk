import { EventEmitter } from "node:events";
import { need } from "./loader.js";

function dv(): any {
  return need("@discordjs/voice");
}

export interface VoiceJoinOptions {
  channelId: string;
  guildId: string;
  adapterCreator: unknown;
  selfDeaf?: boolean;
  selfMute?: boolean;
}

export class DiscordVoice extends EventEmitter {
  private conn: any = null;
  private player: any = null;
  private silenced = false;
  private guildId: string | null = null;

  join(opts: VoiceJoinOptions): this {
    if (!opts.channelId || !opts.guildId || !opts.adapterCreator) {
      throw new Error("join needs { channelId, guildId, adapterCreator }.");
    }
    const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, AudioPlayerStatus, VoiceConnectionStatus, entersState } = dv();
    this.leave(true);
    this.guildId = opts.guildId;
    this.conn = joinVoiceChannel({
      channelId: opts.channelId,
      guildId: opts.guildId,
      adapterCreator: opts.adapterCreator,
      selfDeaf: opts.selfDeaf !== false,
      selfMute: !!opts.selfMute
    });
    this.conn.on("error", (err: unknown) => this.emit("error", err));
    try {
      const c = this.conn;
      if (c && VoiceConnectionStatus && entersState) {
        c.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(c, VoiceConnectionStatus.Signalling, 5000),
              entersState(c, VoiceConnectionStatus.Connecting, 5000)
            ]);
          } catch {
            try {
              c.destroy();
            } catch {  }
          }
        });
      }
    } catch {  }
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.player.on(AudioPlayerStatus.Idle, () => this.emit("idle"));
    this.player.on("error", (err: unknown) => this.emit("error", err));
    this.conn.subscribe(this.player);
    this.silenced = false;
    try {
      const c = this.conn;
      if (c && entersState && VoiceConnectionStatus) {
        entersState(c, VoiceConnectionStatus.Ready, 10000).then(() => {
          this.emit("connected");
        }).catch((err: unknown) => {
          this.emit("error", err);
        });
      } else {
        this.emit("connected");
      }
    } catch {
      this.emit("connected");
    }
    return this;
  }

  play(source: unknown, opts?: Record<string, unknown>): this {
    if (!this.player) throw new Error("Join a voice channel first.");
    const { createAudioResource, entersState, AudioPlayerStatus } = dv();
    this.player.play(createAudioResource(source, opts || {}));
    if (this.silenced) {
      this.silenced = false;
      this.emit("silent", false);
    }
    try {
      const p = this.player;
      if (p && entersState && AudioPlayerStatus) {
        entersState(p, AudioPlayerStatus.Playing, 10000).then(() => {
          this.emit("playing");
        }).catch((err: unknown) => {
          this.emit("error", err);
        });
      } else {
        this.emit("playing");
      }
    } catch {
      this.emit("playing");
    }
    return this;
  }

  stop(): this {
    try {
      if (this.player) this.player.stop();
    } catch {  }
    this.emit("stopped");
    return this;
  }

  async silent(value?: boolean): Promise<boolean> {
    if (!this.player) return this.silenced;
    const next = value === undefined ? !this.silenced : !!value;
    if (next === this.silenced) return this.silenced;
    this.silenced = next;
    try {
      if (next) this.player.pause();
      else this.player.unpause();
    } catch (e) {
      this.silenced = !next;
      throw e;
    }
    this.emit("silent", this.silenced);
    return this.silenced;
  }

  get isSilenced(): boolean {
    return this.silenced;
  }

  get joined(): boolean {
    if (this.conn) return true;
    try {
      const { getVoiceConnection } = dv();
      if (getVoiceConnection && this.guildId) return !!getVoiceConnection(this.guildId);
    } catch {  }
    return false;
  }

  leave(quiet?: boolean): this {
    try {
      if (this.player) this.player.stop(true);
    } catch {  }
    try {
      if (this.conn) this.conn.destroy();
    } catch {  }
    try {
      const { getVoiceConnection } = dv();
      if (getVoiceConnection && this.guildId) {
        const tracked = getVoiceConnection(this.guildId);
        if (tracked && tracked !== this.conn) {
          try {
            tracked.destroy();
          } catch {  }
        }
      }
    } catch {  }
    this.player = null;
    this.conn = null;
    this.guildId = null;
    this.silenced = false;
    if (!quiet) this.emit("ended", "left");
    return this;
  }

  async end(): Promise<void> {
    this.leave();
  }
}

export const DcVoice = DiscordVoice;
