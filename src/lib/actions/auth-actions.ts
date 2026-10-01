"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

export type ActionState = { error?: string; success?: string; resetLink?: string };

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "");

  try {
    // "/" routes to /dashboard or /ops by role; without it NextAuth returns to /sign-in.
    await signIn("credentials", { email, password, redirectTo: callbackUrl || "/" });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Incorrect email or password." };
    }
    // NextAuth throws a redirect internally on success — let it propagate.
    throw err;
  }
}

async function issueToken(email: string) {
  const token = randomBytes(24).toString("hex");
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  return token;
}

export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.string().email();
  const parsed = schema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const user = await prisma.user.findUnique({ where: { email: parsed.data } });
  // Always respond the same way whether or not the account exists.
  if (!user || user.status !== "ACTIVE") {
    return { success: "If that email has an account, a reset link has been sent." };
  }

  const token = await issueToken(user.email);
  return {
    success: "If that email has an account, a reset link has been sent.",
    resetLink: `/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`,
  };
}

export async function requestInviteResendAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "INVITED") return { resetLink: undefined as string | undefined };
  const token = await issueToken(user.email);
  return { resetLink: `/invite?token=${token}&email=${encodeURIComponent(user.email)}` };
}

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.");

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const mode = String(formData.get("mode") ?? "invite"); // "invite" | "reset"

  const parsedPw = passwordSchema.safeParse(password);
  if (!parsedPw.success) return { error: parsedPw.error.issues[0].message };
  if (password !== confirm) return { error: "Passwords do not match." };

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!record || record.expires < new Date()) {
    return { error: "This link has expired. Request a new one." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email },
    data: { passwordHash, status: "ACTIVE", invitedAt: mode === "invite" ? new Date() : undefined },
  });
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } });

  return { success: "Password set. You can now sign in." };
}
