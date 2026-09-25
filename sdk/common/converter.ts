import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { proxyFetch } from "./proxy.js";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import webpmux from "node-webpmux";

const { Image } = webpmux as any;
import { Readable } from "node:stream";

const TMP_DIR = path.join(os.tmpdir(), "sdk");
const MAX_INPUT_SIZE = 50 * 1024 * 1024;

export interface FfmpegResult {
  data: unknown;
  stream?: unknown;
  filename: string;
  buffer?: Buffer;
  toBuffer: () => Promise<Buffer>;
  clear: () => Promise<void>;
}

export interface FfmpegOptions {
  isAudio?: boolean;
  [key: string]: unknown;
}

export interface StickerOptions {
  packname?: string;
  author?: string;
}

export function isReadableStream(obj: unknown): boolean {
  return (
    (obj !== null &&
      typeof obj === "object" &&
      typeof (obj as Record<string, unknown>).pipe === "function" &&
      typeof (obj as Record<string, unknown>).read === "function" &&
      typeof (obj as Record<string, unknown>).on === "function") ||
    obj instanceof Readable
  );
}

export function saveStreamToFile(stream: Readable, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    stream.pipe(ws);
    ws.on("finish", () => resolve());
    ws.on("error", reject);
    stream.on("error", reject);
  });
}

export function getSpawnEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.platform === "linux" && env.HOME) {
    const localBin = path.join(env.HOME, ".local", "bin");
    const termuxBin = "/data/data/com.termux/files/usr/bin";
    env.PATH = `${termuxBin}:${localBin}:${env.PATH}`;
  }
  return env;
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { env: getSpawnEnv() });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited ${code}`));
    });
  });
}

export async function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args, { env: getSpawnEnv() });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `ffprobe ${code}`));
    });
  });
}

export async function ffmpeg(
  bufferOrStream: Buffer | Readable,
  args: string[] = [],
  ext = "",
  ext2 = "",
  opts: FfmpegOptions = {}
): Promise<FfmpegResult> {
  const isAudio = opts.isAudio || false;
  const tmpBase = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const tmp = path.join(TMP_DIR, `${tmpBase}.${ext || "bin"}`);
  const out = `${tmp}.${ext2 || "out"}`;
  let tmpCreated = false;
  let outCreated = false;
  try {
    await fs.promises.mkdir(TMP_DIR, { recursive: true });
    const isStream = isReadableStream(bufferOrStream);
    if (isStream) {
      await saveStreamToFile(bufferOrStream as Readable, tmp);
    } else {
      if (!Buffer.isBuffer(bufferOrStream)) throw new Error("ffmpeg: input must be Buffer or Readable Stream");
      await fs.promises.writeFile(tmp, bufferOrStream);
    }
    tmpCreated = true;
    if (isAudio) {
      try {
        const stat = await fs.promises.stat(tmp);
        if (stat.size > MAX_INPUT_SIZE) {
          const preOut = `${tmp}.pre.mp3`;
          try {
            await runFfmpeg(["-y", "-i", tmp, "-vn", "-c:a", "libmp3lame", "-b:a", "96k", preOut]);
            await fs.promises.unlink(tmp).catch(() => {});
            await fs.promises.rename(preOut, tmp).catch(async () => {
              try {
                await fs.promises.copyFile(preOut, tmp);
                await fs.promises.unlink(preOut);
              } catch {}
            });
          } catch {
            await fs.promises.unlink(preOut).catch(() => {});
          }
        }
      } catch {}
    }
    await runFfmpeg(["-y", "-i", tmp, ...args, out]);
    outCreated = true;
    await fs.promises.unlink(tmp).catch(() => {});
    tmpCreated = false;
    const dataStream = fs.createReadStream(out);
    const result: FfmpegResult = {
      data: dataStream,
      filename: out,
      async toBuffer() {
        const bufs: Buffer[] = [];
        const rs = fs.createReadStream(out);
        for await (const chunk of rs) bufs.push(chunk as Buffer);
        return Buffer.concat(bufs);
      },
      async clear() {
        try {
          dataStream.destroy();
        } catch {}
        await fs.promises.unlink(out).catch(() => {});
      }
    };
    try {
      const buf = await fs.promises.readFile(out);
      result.data = buf;
      result.stream = dataStream;
      result.toBuffer = async () => buf;
    } catch {}
    return result;
  } catch (e) {
    if (tmpCreated) await fs.promises.unlink(tmp).catch(() => {});
    if (outCreated) await fs.promises.unlink(out).catch(() => {});
    try {
      await fs.promises.unlink(out).catch(() => {});
    } catch {}
    throw e;
  }
}

export function toPTT(buffer: Buffer, ext?: string): Promise<FfmpegResult> {
  return ffmpeg(buffer, ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on"], ext, "ogg", { isAudio: true });
}

export function toAudio(buffer: Buffer, ext?: string): Promise<FfmpegResult> {
  return ffmpeg(
    buffer,
    ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-compression_level", "10"],
    ext,
    "opus",
    { isAudio: true }
  );
}

export function toVideo(buffer: Buffer, ext?: string): Promise<FfmpegResult> {
  return ffmpeg(buffer, ["-c:v", "libx264", "-c:a", "aac", "-ab", "128k", "-ar", "44100", "-crf", "32", "-preset", "slow"], ext, "mp4");
}

export function makeExif(packname?: string, author?: string, categories: string[] = [""], extra: Record<string, unknown> = {}): Buffer {
  const json = {
    "sticker-pack-id": "sdk",
    "sticker-pack-name": packname || "Sticker",
    "sticker-pack-publisher": author || "Bot",
    emojis: categories ? categories : [""],
    ...extra
  };
  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
  const exifAttr = Buffer.from([73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 65, 87, 7, 0, 0, 0, 0, 0, 22, 0, 0, 0]);
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  return exif;
}

export async function addExif(webpBuffer: Buffer, packname?: string, author?: string, categories: string[] = [""], extra: Record<string, unknown> = {}): Promise<Buffer> {
  const img = new Image();
  await img.load(webpBuffer);
  img.exif = makeExif(packname, author, categories, extra);
  return (await img.save(null)) as Buffer;
}

function getMediaDuration(buffer: Buffer, ext?: string): Promise<number> {
  return new Promise(async (resolve) => {
    const tmpFile = path.join(TMP_DIR, `_dur_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${ext}`);
    try {
      await fs.promises.mkdir(TMP_DIR, { recursive: true });
      await fs.promises.writeFile(tmpFile, buffer);
    } catch {
      return resolve(6);
    }
    try {
      const out = await runFfprobe(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", tmpFile]);
      try {
        await fs.promises.unlink(tmpFile);
      } catch {}
      const dur = parseFloat(String(out).trim());
      resolve(isNaN(dur) ? 6 : Math.min(dur, 6));
    } catch {
      try {
        await fs.promises.unlink(tmpFile);
      } catch {}
      resolve(6);
    }
  });
}

export async function sticker(buffer: Buffer, options: StickerOptions = {}): Promise<Buffer> {
  const { packname = "Sticker", author = "Bot" } = options;
  const isGif = buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70;
  const isMp4 = buffer.includes(Buffer.from("ftypmp4")) || buffer.includes(Buffer.from("ftypisom"));
  const isAnimated = isGif || isMp4;
  await fs.promises.mkdir(TMP_DIR, { recursive: true });
  const ts = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const tmpInBase = path.join(TMP_DIR, `stk_${ts}`);
  const tmpOut = path.join(TMP_DIR, `stk_${ts}.webp`);
  let ext = "png";
  if (isAnimated) ext = isGif ? "gif" : "mp4";
  else if (buffer[0] === 255 && buffer[1] === 216) ext = "jpg";
  else if (buffer[0] === 137 && buffer[1] === 80) ext = "png";
  const inputFile = `${tmpInBase}.${ext}`;
  await fs.promises.writeFile(inputFile, buffer);
  let args: string[];
  if (isAnimated) {
    const duration = await getMediaDuration(buffer, ext);
    args = ["-y", "-i", inputFile, "-vcodec", "libwebp", "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=000000[p];[b][p]paletteuse", "-loop", "0", "-t", String(Math.min(duration, 6)), "-preset", "default", "-an", "-pix_fmt", "yuva420p", tmpOut];
  } else {
    args = ["-y", "-i", inputFile, "-vcodec", "libwebp", "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=000000[p];[b][p]paletteuse", "-lossless", "0", "-compression_level", "6", "-quality", "80", "-loop", "0", "-an", "-pix_fmt", "yuva420p", tmpOut];
  }
  try {
    await runFfmpeg(args);
  } catch (e) {
    await fs.promises.unlink(inputFile).catch(() => {});
    await fs.promises.unlink(tmpOut).catch(() => {});
    throw e;
  }
  await fs.promises.unlink(inputFile).catch(() => {});
  let webpBuf: Buffer;
  try {
    webpBuf = await fs.promises.readFile(tmpOut);
  } catch (e) {
    await fs.promises.unlink(tmpOut).catch(() => {});
    throw e;
  }
  await fs.promises.unlink(tmpOut).catch(() => {});
  try {
    return await addExif(webpBuf, packname, author);
  } catch {
    return webpBuf;
  }
}

export interface ResizeOptions {
  proxy?: string;
}

export async function resize(input: Buffer | string, width?: number, height?: number, opts: ResizeOptions = {}): Promise<Buffer | null> {
  try {
    const w = width || 300;
    const h = height || 300;
    let data: Buffer;
    if (Buffer.isBuffer(input)) {
      data = input;
    } else if (/^https?:\/\//.test(String(input))) {
      const res = await proxyFetch(String(input), opts.proxy ? { proxy: opts.proxy } : {});
      if (!res.ok) return null;
      data = Buffer.from(await res.arrayBuffer());
    } else if (typeof input === "string" && fs.existsSync(input)) {
      data = fs.readFileSync(input);
    } else {
      return null;
    }
    return await sharp(data).resize(w, h, { fit: "fill" }).jpeg().toBuffer();
  } catch {
    return null;
  }
}
