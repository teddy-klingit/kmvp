/**
 * What a video review needs from an MP4 / MOV file, read from its header boxes (no ffmpeg on the server):
 * duration, frame rate, size and whether it has a sound track. Returns null for anything it can't read.
 */
export type VideoInfo = { durationSeconds: number; fps: number | null; width: number | null; height: number | null; hasAudio: boolean };

type Box = { type: string; start: number; end: number };

function boxes(buf: Buffer, start: number, end: number): Box[] {
  const out: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) break;
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) break;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}

const child = (buf: Buffer, b: Box | undefined, type: string) => (b ? boxes(buf, b.start, b.end).find((x) => x.type === type) : undefined);

/** Timescale and duration of an mvhd / mdhd box (version 0 or 1). */
function timing(buf: Buffer, b: Box) {
  const v = buf[b.start];
  return v === 1 ? { scale: buf.readUInt32BE(b.start + 20), duration: Number(buf.readBigUInt64BE(b.start + 24)) } : { scale: buf.readUInt32BE(b.start + 12), duration: buf.readUInt32BE(b.start + 16) };
}

export function readMp4(buf: Buffer): VideoInfo | null {
  try {
    const moov = boxes(buf, 0, buf.length).find((b) => b.type === "moov");
    const mvhd = child(buf, moov, "mvhd");
    if (!moov || !mvhd) return null;
    const movie = timing(buf, mvhd);
    if (!movie.scale) return null;
    let fps: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let hasAudio = false;
    for (const trak of boxes(buf, moov.start, moov.end).filter((b) => b.type === "trak")) {
      const mdia = child(buf, trak, "mdia");
      const hdlr = child(buf, mdia, "hdlr");
      const handler = hdlr ? buf.toString("latin1", hdlr.start + 8, hdlr.start + 12) : "";
      if (handler === "soun") hasAudio = true;
      if (handler !== "vide" || fps !== null) continue;
      const tkhd = child(buf, trak, "tkhd");
      if (tkhd) {
        // The last 8 bytes of tkhd: width and height as 16.16 fixed point.
        width = buf.readUInt32BE(tkhd.end - 8) >>> 16 || null;
        height = buf.readUInt32BE(tkhd.end - 4) >>> 16 || null;
      }
      const mdhd = child(buf, mdia, "mdhd");
      const stts = child(buf, child(buf, child(buf, mdia, "minf"), "stbl"), "stts");
      if (mdhd && stts) {
        const { scale } = timing(buf, mdhd);
        const entries = buf.readUInt32BE(stts.start + 4);
        let samples = 0;
        let ticks = 0;
        for (let i = 0; i < entries; i++) {
          const count = buf.readUInt32BE(stts.start + 8 + i * 8);
          samples += count;
          ticks += count * buf.readUInt32BE(stts.start + 12 + i * 8);
        }
        if (ticks > 0) fps = Math.round(((samples * scale) / ticks) * 100) / 100;
      }
    }
    return { durationSeconds: Math.round((movie.duration / movie.scale) * 100) / 100, fps, width, height, hasAudio };
  } catch {
    return null;
  }
}
