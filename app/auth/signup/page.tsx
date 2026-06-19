import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { Logo } from "@/components/layout/Logo";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-6 flex justify-center" aria-label="Zenith home">
        <Logo unique="signup" markClassName="h-8 w-8" />
      </Link>
      <div className="glass-strong rounded-2xl p-7">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Free — unlocks 5 days of history and streak tracking.
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
