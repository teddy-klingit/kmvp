"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Share2, Pencil, Trash2, Check, X } from "lucide-react";
import { deleteBrandAssetAction, updateBrandAssetAction } from "@/lib/actions/brand-asset-actions";
import { VISUAL_IDENTITY_FOLDERS } from "@/lib/brand-iq-taxonomy";

const CHECKERBOARD = {
  backgroundImage:
    "linear-gradient(45deg, #e7e4dd 25%, transparent 25%), linear-gradient(-45deg, #e7e4dd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e7e4dd 75%), linear-gradient(-45deg, transparent 75%, #e7e4dd 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

const MOVABLE_CATEGORIES: { value: string; label: string }[] = [
  { value: "LOGO", label: "Logotype" },
  { value: "PHOTOGRAPHY", label: "Photography" },
  { value: "ILLUSTRATION", label: "Illustration" },
  { value: "ICON", label: "Icons" },
  { value: "PATTERN", label: "Patterns & textures" },
  { value: "VIDEO", label: "Video" },
  { value: "ANIMATION", label: "Animation" },
];

export type BrandAssetLike = {
  id: string;
  name: string;
  variant: string | null;
  format: string | null;
  previewColor: string;
  dimensions: string | null;
  fileSizeLabel: string | null;
  colorSpace: string | null;
  category: string;
  fileUrl?: string | null;
};

export function AssetTile({ asset, transparent = false }: { asset: BrandAssetLike; transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setEditing(false);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="group flex flex-col gap-1.5 text-left">
          <div
            className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border transition-colors group-hover:border-ink/40"
            style={transparent ? CHECKERBOARD : asset.fileUrl ? undefined : { backgroundColor: asset.previewColor }}
          >
            {asset.fileUrl && asset.format === "MP4" ? (
              <video src={asset.fileUrl} muted loop playsInline autoPlay aria-label={asset.name} className="size-full object-cover" />
            ) : asset.fileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.fileUrl} alt={asset.name} className={transparent ? "size-2/3 object-contain" : "size-full object-cover"} />
            ) : (
              transparent && (
                <span
                  className="flex size-2/3 items-center justify-center rounded-md text-lg font-bold text-white"
                  style={{ backgroundColor: asset.previewColor }}
                >
                  {asset.name.slice(0, 2).toUpperCase()}
                </span>
              )
            )}
          </div>
          <div>
            <p className="truncate text-xs font-medium">{asset.name}</p>
            {asset.variant && <p className="truncate text-xs text-muted-foreground">{asset.variant}</p>}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit asset" : asset.name}</DialogTitle>
        </DialogHeader>
        <div
          className="mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border"
          style={transparent ? CHECKERBOARD : asset.fileUrl ? undefined : { backgroundColor: asset.previewColor }}
        >
          {asset.fileUrl && asset.format === "MP4" ? (
            <video src={asset.fileUrl} controls playsInline aria-label={asset.name} className="size-full bg-black object-contain" />
          ) : asset.fileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.fileUrl} alt={asset.name} className={transparent ? "size-1/2 object-contain" : "size-full object-cover"} />
          ) : (
            transparent && (
              <span
                className="flex size-24 items-center justify-center rounded-xl font-display text-2xl font-light text-white"
                style={{ backgroundColor: asset.previewColor }}
              >
                {asset.name.slice(0, 2).toUpperCase()}
              </span>
            )
          )}
        </div>

        {editing ? (
          <form
            action={(formData) => {
              startTransition(async () => {
                await updateBrandAssetAction({}, formData);
                setEditing(false);
              });
            }}
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="assetId" value={asset.id} />
            <input type="hidden" name="oldCategory" value={asset.category} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input name="name" defaultValue={asset.name} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Variant</label>
              <Input name="variant" defaultValue={asset.variant ?? ""} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Folder</label>
              <select
                name="category"
                defaultValue={asset.category}
                disabled={pending}
                className="h-9 rounded-md border border-border bg-card px-3 text-sm"
              >
                {MOVABLE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1 flex gap-2">
              <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
                <Check className="size-3.5" />
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="flex flex-col gap-2.5 text-sm">
              {asset.variant && <Row label="Variant" value={asset.variant} />}
              {asset.dimensions && <Row label="Size" value={asset.dimensions} />}
              {asset.format && <Row label="Format" value={asset.format} />}
              {asset.fileSizeLabel && <Row label="File size" value={asset.fileSizeLabel} />}
              {asset.colorSpace && <Row label="Colour space" value={asset.colorSpace} />}
            </dl>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button size="sm" className="gap-1.5">
                <Download className="size-3.5" />
                Download
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <Share2 className="size-3.5" />
                Share
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <form
                action={async (formData) => {
                  await deleteBrandAssetAction(formData);
                  setOpen(false);
                }}
              >
                <input type="hidden" name="assetId" value={asset.id} />
                <input type="hidden" name="category" value={VISUAL_IDENTITY_FOLDERS.find((f) => categoryMatches(f.slug, asset.category))?.slug ?? ""} />
                <Button type="submit" size="sm" variant="secondary" className="gap-1.5 text-danger-foreground hover:bg-danger-soft">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
              {asset.format && <Badge tone="neutral">{asset.format}</Badge>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function categoryMatches(slug: string, category: string) {
  const map: Record<string, string> = {
    logotype: "LOGO",
    photography: "PHOTOGRAPHY",
    illustration: "ILLUSTRATION",
    icons: "ICON",
    patterns: "PATTERN",
    video: "VIDEO",
    animation: "ANIMATION",
  };
  return map[slug] === category;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
