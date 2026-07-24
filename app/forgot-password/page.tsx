import { Suspense } from "react";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Logo } from "@/components/layout/Logo";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";

export default function ForgotPasswordPage() {
  return (
    <>
    <AuthBackdrop variant="screener" />
    <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-6 flex justify-center" aria-label="Zenith home">
        <Logo unique="forgot" markClassName="h-8 w-8" />
      </Link>
      <div className="glass-strong rounded-2xl p-7">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Enter your account email and we&apos;ll send you a reset link.
        </p>
        <Suspense>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </main>
    </>
  );
}
