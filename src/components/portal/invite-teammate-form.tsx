"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { inviteClientTeammateAction, type InviteState } from "@/lib/actions/team-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const initialState: InviteState = {};

export function InviteTeammateForm() {
  const [state, formAction, pending] = useActionState(inviteClientTeammateAction, initialState);
  const [permission, setPermission] = useState("VIEWER");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Permission</Label>
          <Select value={permission} onValueChange={setPermission}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OWNER">Owner</SelectItem>
              <SelectItem value="APPROVER">Approver</SelectItem>
              <SelectItem value="VIEWER">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="permission" value={permission} />
        </div>
      </div>
      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-success-foreground">
          {state.success}{" "}
          {state.inviteLink && (
            <>
              Dev preview —{" "}
              <Link href={state.inviteLink} className="text-primary hover:underline">
                open invite link
              </Link>
            </>
          )}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Inviting…" : "Invite teammate"}
      </Button>
    </form>
  );
}
