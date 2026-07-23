import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionTier } from "@/lib/supabase/types";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { TickerClickToggle } from "@/components/settings/TickerClickToggle";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { FeedbackForm } from "@/components/settings/FeedbackForm";
import { ManageBillingButton } from "@/components/settings/ManageBillingButton";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

// Settings is organized into labeled groups (Account / Preferences / Billing /
// Support), each its own panel — the norm for account areas, and the group
// label carries an anchor id so nav can deep-link (e.g. /settings#support).
function Group({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    // scroll-mt clears the sticky header when deep-linked (/settings#support).
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20">
      <h2
        id={`${id}-heading`}
        className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h2>
      <div className="glass mt-2 divide-y divide-foreground/5 overflow-hidden rounded-2xl">
        {children}
      </div>
    </section>
  );
}

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
    <div className="p-6">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
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
        description="Manage your account, preferences, billing, and support."
        unique="settings"
      />

      <div className="mt-8 flex flex-col gap-8">
        <Group id="account" title="Account">
          <Section title="Profile" description="Your name and login email.">
            <ProfileForm initialName={name} email={user.email ?? ""} />
          </Section>

          <Section title="Sign out">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                <p>{user.email}</p>
                {memberSince && <p>Member since {memberSince}</p>}
              </div>
              <SignOutButton />
            </div>
          </Section>
        </Group>

        <Group id="preferences" title="Preferences">
          <Section title="Appearance" description="Choose how Zenith looks.">
            <ThemeToggle />
          </Section>

          <Section
            title="Ticker click"
            description="What happens when you click a stock on the screener or in history."
          >
            <TickerClickToggle />
          </Section>
        </Group>

        <Group id="billing" title="Billing">
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
                  className="w-fit rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02]"
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          </Section>
        </Group>

        <Group id="support" title="Support">
          <Section
            title="Feedback"
            description="Spotted a bug or have an idea? It goes straight to us."
          >
            <FeedbackForm />
          </Section>

          <Section title="Contact">
            <p className="text-sm text-muted-foreground">
              For anything else — billing issues, account help — email{" "}
              <a
                href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                className="text-brand hover:underline"
              >
                {LEGAL_CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </Group>
      </div>
    </main>
  );
}
