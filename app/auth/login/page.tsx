import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { Logo } from "@/components/layout/Logo";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = (await searchParams).next;
  const variant =
    typeof next === "string" && next.includes("/history")
      ? "history"
      : "screener";

  return (
    <>
    <AuthBackdrop variant={variant} />
    <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-6 flex justify-center" aria-label="Zenith home">
        <Logo unique="login" markClassName="h-8 w-8" />
      </Link>
      <div className="glass-strong rounded-2xl p-7">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Sign in to view history and your Pro features.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
    </>
  );
}
