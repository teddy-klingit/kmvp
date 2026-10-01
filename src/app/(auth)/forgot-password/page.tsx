"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type ActionState } from "@/lib/actions/auth-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll send a link to reset your password.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.success ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">{state.success}</p>
            {state.resetLink && (
              <div className="rounded-md border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
                Dev preview (no email service wired up yet) —{" "}
                <Link href={state.resetLink} className="text-primary hover:underline">
                  open reset link
                </Link>
              </div>
            )}
            <Link href="/sign-in" className="text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@company.com" required />
            </div>
            {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <Link href="/sign-in" className="text-center text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
