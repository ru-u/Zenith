import { SignupForm } from "@/components/auth/SignupForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default async function SignupPage({
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
    <AuthShell
      variant={variant}
      unique="signup"
      title="Create your account"
      subtitle="Free — price charts, streak badges, favorites, and the last 5 trading days."
    >
      <SignupForm />
    </AuthShell>
  );
}
