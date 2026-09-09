import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

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
    <AuthShell
      variant={variant}
      unique="login"
      title="Welcome back"
      subtitle="Sign in to view history and your Pro features."
    >
      <LoginForm />
    </AuthShell>
  );
}
