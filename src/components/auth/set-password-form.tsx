"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { setPasswordAction, type ActionState } from "@/lib/actions/auth-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export function SetPasswordForm({ mode }: { mode: "invite" | "reset" }) {
  const [state, formAction, pending] = useActionState(setPasswordAction, initialState);
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  if (!token || !email) {
    return <p className="text-sm text-danger-foreground">This link is missing required information.</p>;
  }

  if (state.success) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{state.success}</p>
        <Button asChild>
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="mode" value={mode} />
      <div className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <Input value={email} disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{mode === "invite" ? "Create a password" : "New password"}</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} />
      </div>
      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : mode === "invite" ? "Set password & continue" : "Reset password"}
      </Button>
    </form>
  );
}
