"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveBrandInfoAction, completeOnboardingAction } from "@/lib/actions/onboarding-actions";
import { InviteTeammateForm } from "@/components/portal/invite-teammate-form";
import { Logo } from "@/components/ui/logo";

const STEPS = ["Brand info", "Upload assets", "Brand guidelines", "Team access", "All done"];
const PERSONALITY_OPTIONS = ["Bold", "Friendly", "Modern", "Minimal", "Playful", "Premium"];

export function OnboardingWizard({ brandName, industry }: { brandName: string; industry: string }) {
  const [step, setStep] = useState(0);
  const [personality, setPersonality] = useState<string[]>([]);
  const [savedStep1, setSavedStep1] = useState(false);

  function togglePersonality(p: string) {
    setPersonality((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : prev.length < 3 ? [...prev, p] : prev));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl">
      <aside className="w-56 shrink-0 border-r border-border px-6 py-8">
        <Logo className="mb-1 h-5 w-auto text-foreground" />
        <p className="mb-8 text-xs text-muted-foreground">Setting up your workspace</p>
        <div className="flex flex-col gap-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-2.5 shrink-0 rounded-full",
                  i < step ? "bg-success" : i === step ? "bg-primary" : "bg-border"
                )}
              />
              <span className={cn("text-sm", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 px-10 py-8">
        {step === 0 && (
          <form
            action={async (fd) => {
              await saveBrandInfoAction(fd);
              setSavedStep1(true);
              setStep(1);
            }}
            className="flex max-w-lg flex-col gap-5"
          >
            <h1 className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-info-soft text-xs text-primary">1</span>
              Tell us about your brand
            </h1>
            <p className="-mt-3 text-sm text-muted-foreground">
              This helps us build your brand OS — the foundation every agent uses to produce on-brand work.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="brandName">Brand name</Label>
              <Input id="brandName" name="brandName" defaultValue={brandName} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" defaultValue={industry} placeholder="e.g. Fintech / Consumer payments" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>
                Brand personality <span className="text-muted-foreground">Choose up to 3</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {PERSONALITY_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => togglePersonality(p)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium",
                      personality.includes(p)
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input type="hidden" name="personality" value={personality.join(",")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primaryColor">Brand colour (primary hex)</Label>
              <Input id="primaryColor" name="primaryColor" placeholder="#2F5FE3" className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primaryFont">Primary font</Label>
              <Input id="primaryFont" name="primaryFont" placeholder="e.g. Inter" />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Continue to assets</Button>
              <Button type="button" variant="secondary" asChild>
                <Link href="/dashboard">Save and finish later</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Your data is private. Only your Klingit team has access.</p>
          </form>
        )}

        {step === 1 && (
          <div className="flex max-w-lg flex-col gap-5">
            <h1 className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-info-soft text-xs text-primary">2</span>
              Upload your assets
            </h1>
            <p className="-mt-3 text-sm text-muted-foreground">
              Logos, product shots, past work — anything that helps agents learn your visual world.
            </p>
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted p-10 text-center">
              <Upload className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drop files here, or click to browse</p>
              {savedStep1 && <p className="text-xs text-success-foreground">Brand info saved.</p>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(2)}>
                Continue to guidelines
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex max-w-lg flex-col gap-5">
            <h1 className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-info-soft text-xs text-primary">3</span>
              Brand guidelines
            </h1>
            <p className="-mt-3 text-sm text-muted-foreground">
              Tell agents what to always do, and what to never do.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Do&apos;s</Label>
              <Textarea placeholder="One per line" className="min-h-24" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Don&apos;ts</Label>
              <Textarea placeholder="One per line" className="min-h-24" />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                Continue to team
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex max-w-lg flex-col gap-5">
            <h1 className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-info-soft text-xs text-primary">4</span>
              Invite your team
            </h1>
            <p className="-mt-3 text-sm text-muted-foreground">
              Add teammates who should see projects and approve work. You can always do this later from Account.
            </p>
            <InviteTeammateForm />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(4)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <form action={completeOnboardingAction} className="flex max-w-lg flex-col gap-5">
            <input type="hidden" name="redirectTo" value="/dashboard" />
            <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success-foreground">
              <Check className="size-6" />
            </div>
            <h1 className="text-lg font-semibold">You&apos;re all set</h1>
            <p className="-mt-3 text-sm text-muted-foreground">
              We&apos;re building your Brand OS now. Your account lead will follow up once it&apos;s ready — usually
              within a few hours.
            </p>
            <Button type="submit" className="self-start">
              Go to dashboard
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
