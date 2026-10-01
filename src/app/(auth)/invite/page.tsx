import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export default function InvitePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited to Klingit</CardTitle>
        <CardDescription>Set a password to activate your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <SetPasswordForm mode="invite" />
        </Suspense>
      </CardContent>
    </Card>
  );
}
