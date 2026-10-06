/**
 * In the browser, at upload: a video's poster frame and a thumbnail strip (frames side by side), drawn from the
 * file with <video> + canvas, so the server needs no ffmpeg. Resolves null when the browser can't decode the file.
 */
export async function videoFrames(file: File, frames = 10): Promise<{ poster: Blob; strip: Blob; durationSeconds: number } | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 15_000);
      video.addEventListener(event, () => (clearTimeout(t), resolve()), { once: true });
      video.addEventListener("error", () => (clearTimeout(t), reject(new Error("decode"))), { once: true });
    });
  const seek = async (t: number) => {
    const done = once("seeked");
    video.currentTime = t;
    await done;
  };
  const jpeg = (c: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.82));
  try {
    await once("loadeddata");
    const duration = video.duration;
    if (!Number.isFinite(duration) || !video.videoWidth) return null;

    // Poster: a frame a little way in (the very first frame is often black).
    const poster = document.createElement("canvas");
    const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
    poster.width = Math.round(video.videoWidth * scale);
    poster.height = Math.round(video.videoHeight * scale);
    await seek(Math.min(1, duration / 10));
    poster.getContext("2d")!.drawImage(video, 0, 0, poster.width, poster.height);

    // Strip: evenly spaced frames, 160 px high.
    const h = 160;
    const w = Math.round((video.videoWidth / video.videoHeight) * h);
    const strip = document.createElement("canvas");
    strip.width = w * frames;
    strip.height = h;
    const ctx = strip.getContext("2d")!;
    for (let i = 0; i < frames; i++) {
      await seek(((i + 0.5) / frames) * duration);
      ctx.drawImage(video, i * w, 0, w, h);
    }
    const [p, s] = await Promise.all([jpeg(poster), jpeg(strip)]);
    return p && s ? { poster: p, strip: s, durationSeconds: duration } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
