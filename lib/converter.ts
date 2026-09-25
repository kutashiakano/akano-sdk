import * as common from "../sdk/common/converter.js";

async function bufOf(result: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(result)) return result;
  const r = result as { toBuffer?: () => Promise<Buffer>; data?: Buffer };
  if (r && typeof r.toBuffer === "function") return r.toBuffer();
  return (r && r.data ? r.data : result) as Buffer;
}

export async function toPTT(buffer: Buffer, ext?: string): Promise<Buffer> {
  return bufOf(await common.toPTT(buffer, ext || "mp3"));
}

export async function toAudio(buffer: Buffer, ext?: string): Promise<Buffer> {
  return bufOf(await common.toAudio(buffer, ext || "mp3"));
}

export async function toVideo(buffer: Buffer, ext?: string): Promise<Buffer> {
  return bufOf(await common.toVideo(buffer, ext || "mp4"));
}

export async function webpToMp4(buffer: Buffer): Promise<Buffer> {
  return bufOf(await common.ffmpeg(buffer, ["-c:v", "libx264", "-pix_fmt", "yuv420p"], "webp", "mp4"));
}
