import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      unique="reset"
      title="Choose a new password"
      subtitle="Pick something you haven't used here before."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
