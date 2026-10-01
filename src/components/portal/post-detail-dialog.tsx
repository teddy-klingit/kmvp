"use client";

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { sampleImageUrl } from "@/lib/sample-image";
import { Video, MousePointerClick, Heart, Bookmark, Share2, MessageCircle } from "lucide-react";

type Post = {
  id: string;
  platform: string;
  contentType: string | null;
  title: string;
  status: string;
  scheduledDate: Date | null;
  publishedDate: Date | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  engagementRate: number | null;
  videoViews: number | null;
  websiteClicks: number | null;
  saves: number | null;
  shares: number | null;
  comments: number | null;
  sourceSuggestionId: string | null;
};

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: string | number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-paper p-3">
      <p className="flex items-center gap-1.5 text-lg font-semibold">
        <Icon className="size-3.5 text-muted-foreground" />
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Click a post row (upcoming or published) to see its full metric set —
 * including the saves/shares/comments the SOW's weekly report requires
 * alongside impressions and engagement rate. */
export function PostDetailDialog({ post, children }: { post: Post; children: React.ReactNode }) {
  const hasMetrics = post.impressions !== null || post.engagements !== null;
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sampleImageUrl(post.id, 96)} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0">
              <DialogTitle>{post.title}</DialogTitle>
              <DialogDescription>
                {post.platform}
                {post.contentType ? ` · ${post.contentType}` : ""} ·{" "}
                {post.status === "PUBLISHED"
                  ? `Published ${post.publishedDate ? formatDate(post.publishedDate) : "—"}`
                  : `Scheduled ${post.scheduledDate ? formatDate(post.scheduledDate) : "—"}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {post.sourceSuggestionId && (
          <Badge tone="accent" className="mb-3 w-fit">
            Scheduled from an approved plan suggestion
          </Badge>
        )}
        {hasMetrics ? (
          <div className="grid grid-cols-2 gap-3">
            {post.impressions !== null && <Stat icon={MousePointerClick} value={post.impressions.toLocaleString()} label="Impressions" />}
            {post.reach !== null && <Stat icon={MousePointerClick} value={post.reach.toLocaleString()} label="Reach" />}
            {post.engagementRate !== null && <Stat icon={Heart} value={`${post.engagementRate}%`} label="Engagement rate" />}
            {post.engagements !== null && <Stat icon={Heart} value={post.engagements.toLocaleString()} label="Engagements" />}
            {post.videoViews !== null && <Stat icon={Video} value={post.videoViews.toLocaleString()} label="Video views" />}
            {post.websiteClicks !== null && <Stat icon={MousePointerClick} value={post.websiteClicks.toLocaleString()} label="Website clicks" />}
            {post.saves !== null && <Stat icon={Bookmark} value={post.saves.toLocaleString()} label="Saves" />}
            {post.shares !== null && <Stat icon={Share2} value={post.shares.toLocaleString()} label="Shares" />}
            {post.comments !== null && <Stat icon={MessageCircle} value={post.comments.toLocaleString()} label="Comments" />}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No performance data yet — this post hasn&apos;t gone live.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
