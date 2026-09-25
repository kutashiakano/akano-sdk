import { pathToFileURL } from "node:url";

export const RESOLUTIONS = ["240p", "360p", "480p", "720p", "1080p"];
export const DEFAULT_ENGINE: string | null = null;
export const ENGINE_FILE: string | null = DEFAULT_ENGINE;

export interface VoiceCallOptions {
  engineFile?: string;
  ffprobePath?: string;
  voipLogLevel?: string;
  tmpDir?: string;
  [key: string]: unknown;
}

function env(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback;
}

const cache = new Map<string, Promise<unknown>>();

function enginePath(opts?: VoiceCallOptions): string | undefined {
  return (opts && opts.engineFile) || env("VOIP_ENGINE", DEFAULT_ENGINE || undefined);
}

const dynamicImport = Function("url", "return import(url)") as (url: string) => Promise<any>;

function loadEngine(file: string | undefined): Promise<any> {
  if (!file) throw new Error("VOIP engine is not configured (set opts.engineFile / VOIP_ENGINE)");
  if (!cache.has(file)) {
    cache.set(file, dynamicImport(pathToFileURL(file).href).then((m) => m.default || m.Voip || m));
  }
  return cache.get(file) as Promise<any>;
}

export class VoiceCall {
  private conn: unknown;
  private opts: VoiceCallOptions;
  private engineInstance: any = null;
  private activeCall: any = null;

  constructor(conn: unknown, opts: VoiceCallOptions = {}) {
    this.conn = conn;
    this.opts = opts || {};
  }

  private async getEngine(): Promise<any> {
    if (!this.engineInstance) {
      const Voip = await loadEngine(enginePath(this.opts));
      this.engineInstance = new Voip(this.conn, {
        ffprobePath: this.opts.ffprobePath || env("VOIP_FFPROBE", "ffprobe"),
        voipLogLevel: this.opts.voipLogLevel || env("VOIP_LOG", "warn"),
        tmpDir: this.opts.tmpDir || env("VOIP_TMPDIR", undefined)
      });
    }
    return this.engineInstance;
  }

  async call(number: string | number, media?: unknown, resolution?: string | { width: number; height: number; frameRate?: number }, options: Record<string, unknown> = {}): Promise<any> {
    if (this.activeCall) throw new Error("A call is already in progress, end it first.");
    const engine = await this.getEngine();
    const target = String(number === undefined || number === null ? "" : number).replace(/\D/g, "");
    if (!target) throw new Error("Invalid phone number.");
    const res =
      typeof resolution === "string" && RESOLUTIONS.includes(resolution.toLowerCase()) ? resolution.toLowerCase() : resolution;
    const call = await engine.call(target, media === undefined ? "silence" : media, res, options || {});
    this.activeCall = call;
    call.once("ended", () => {
      if (this.activeCall === call) this.activeCall = null;
    });
    call.once("error", () => {
      if (this.activeCall === call) this.activeCall = null;
    });
    return call;
  }

  async end(force?: boolean): Promise<void> {
    const engine = await this.getEngine();
    try {
      await engine.end(force === true);
    } finally {
      this.activeCall = null;
    }
  }

  get active(): unknown {
    return this.activeCall;
  }
}

const instances = new WeakMap<object, VoiceCall>();

export function callFor(conn: object, opts: VoiceCallOptions = {}): VoiceCall {
  let inst = instances.get(conn);
  if (!inst) {
    inst = new VoiceCall(conn, opts);
    instances.set(conn, inst);
  }
  return inst;
}
