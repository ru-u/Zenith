import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      unique="forgot"
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a reset link."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
