import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A video's thumbnail: its poster frame, or (a video without one) the frame at 1 s, read straight from the file.
 * A play badge on top says it's a film. Fills its (positioned) parent.
 */
export function VideoThumb({ src, poster, fit = "cover", className }: { src: string; poster: string | null; fit?: "cover" | "contain"; className?: string }) {
  const media = cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain", className);
  return (
    <>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- the access-checked poster frame
        <img src={poster} alt="" loading="lazy" className={media} />
      ) : (
        <video src={`${src}#t=1`} muted playsInline preload="metadata" aria-hidden className={media} />
      )}
      <span aria-hidden className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
        <Play className="ml-0.5 size-4" fill="currentColor" />
      </span>
    </>
  );
}
