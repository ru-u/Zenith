import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="glass-strong rounded-2xl p-7">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Free — unlocks 30 days of history and streak tracking.
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
