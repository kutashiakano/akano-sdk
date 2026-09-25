import * as common from "../sdk/common/converter.js";

export interface ExifMeta {
  packname?: string;
  author?: string;
}

export async function writeExifImg(buffer: Buffer, meta: ExifMeta = {}): Promise<Buffer> {
  return common.sticker(buffer, { packname: meta.packname, author: meta.author });
}

export async function writeExifVid(buffer: Buffer, meta: ExifMeta = {}): Promise<Buffer> {
  return common.sticker(buffer, { packname: meta.packname, author: meta.author });
}

export async function writeExifWebp(buffer: Buffer, meta: ExifMeta = {}): Promise<Buffer> {
  return common.addExif(buffer, meta.packname || "Sticker", meta.author || "Bot");
}

export async function imageToWebp(buffer: Buffer): Promise<Buffer> {
  const out = await common.ffmpeg(
    buffer,
    ["-vcodec", "libwebp", "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000", "-lossless", "0", "-compression_level", "6", "-quality", "80", "-loop", "0", "-an", "-pix_fmt", "yuva420p"],
    "png",
    "webp"
  );
  return out.toBuffer ? out.toBuffer() : (out.data as Buffer);
}

export async function videoToWebp(buffer: Buffer): Promise<Buffer> {
  const out = await common.ffmpeg(
    buffer,
    ["-vcodec", "libwebp", "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000", "-loop", "0", "-t", "6", "-preset", "default", "-an", "-pix_fmt", "yuva420p"],
    "mp4",
    "webp"
  );
  return out.toBuffer ? out.toBuffer() : (out.data as Buffer);
}
