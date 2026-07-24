import { Suspense } from "react";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Logo } from "@/components/layout/Logo";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";

export default function ResetPasswordPage() {
  return (
    <>
    <AuthBackdrop variant="screener" />
    <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-6 flex justify-center" aria-label="Zenith home">
        <Logo unique="reset" markClassName="h-8 w-8" />
      </Link>
      <div className="glass-strong rounded-2xl p-7">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Pick something you haven&apos;t used here before.
        </p>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
    </>
  );
}
