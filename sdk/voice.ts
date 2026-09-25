import OpusScript from "opusscript";

export function opus(): any {
  return OpusScript;
}

export function encoder(rate?: number, channels?: number, app?: number): any {
  const Opus = opus();
  return new (Opus as any)(rate || 48000, channels || 1, app ?? Opus.Application.AUDIO);
}

export function encodePcm(pcmBuffer: Buffer, sampleRate?: number, channels?: number): Buffer {
  const rate = sampleRate || 48000;
  const ch = channels || 1;
  const enc = encoder(rate, ch);
  const frameSamples = Math.floor(rate / 50);
  const out: Buffer[] = [];
  try {
    for (let i = 0; i < pcmBuffer.length; i += frameSamples * ch * 2) {
      out.push(enc.encode(pcmBuffer.slice(i, i + frameSamples * ch * 2), frameSamples));
    }
  } finally {
    try {
      enc.delete();
    } catch {  }
  }
  return Buffer.concat(out);
}

export function decodeOpus(packet: Buffer, sampleRate?: number, channels?: number): Buffer {
  const dec = encoder(sampleRate, channels);
  try {
    return dec.decode(packet);
  } finally {
    try {
      dec.delete();
    } catch {  }
  }
}
