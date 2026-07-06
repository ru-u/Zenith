import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionTier } from "@/lib/supabase/types";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { ManageBillingButton } from "@/components/settings/ManageBillingButton";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

// Sections live inside ONE divided panel (see below) — quieter than a stack
// of floating cards, and the hairlines do the grouping.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, created_at")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier; created_at: string }>();

  const isPro = profile?.subscription_tier === "pro";
  const meta = user.user_metadata ?? {};
  const name =
    (meta.full_name as string) || (meta.name as string) || "";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <PageHeader
        eyebrow="Your account"
        title="Settings"
        description="Manage your profile, appearance, and subscription."
        unique="settings"
      />

      <div className="glass mt-8 divide-y divide-foreground/5 overflow-hidden rounded-2xl">
        <Section title="Profile" description="Your name and login email.">
          <ProfileForm initialName={name} email={user.email ?? ""} />
        </Section>

        <Section title="Appearance" description="Choose how Zenith looks.">
          <ThemeToggle />
        </Section>

        <Section title="Subscription">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Current plan</p>
                <p className="text-sm text-muted-foreground">
                  {isPro ? "Zenith Pro — $4.99/mo" : "Free"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  isPro
                    ? "bg-brand/15 text-brand"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {isPro ? "PRO" : "FREE"}
              </span>
            </div>
            {isPro ? (
              <ManageBillingButton />
            ) : (
              <Link
                href="/upgrade"
                className="w-fit rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02]"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </Section>

        <Section title="Account">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <p>{user.email}</p>
              {memberSince && <p>Member since {memberSince}</p>}
            </div>
            <SignOutButton />
          </div>
        </Section>
      </div>
    </main>
  );
}
