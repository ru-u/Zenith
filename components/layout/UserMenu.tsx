"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const itemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground/90 outline-none transition-colors select-none data-[highlighted]:bg-secondary/70";

export function UserMenu({ name, email }: { name: string; email?: string }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = (name || email || "?").charAt(0).toUpperCase();

  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm outline-none transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[popup-open]:bg-secondary/60">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold leading-none text-brand">
          {initial}
        </span>
        <span className="hidden max-w-[14ch] truncate font-medium text-foreground/80 sm:inline">
          {name}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          {/* `.glass-popover` is an opaque, blur-free surface (see globals.css):
              identical in Chrome and Safari, and nothing behind it can bleed
              through. */}
          <Menu.Popup className="glass-popover min-w-[260px] rounded-xl p-1.5 text-sm outline-none">
            <div className="px-2.5 py-2">
              <p className="truncate font-medium">{name}</p>
              {email && (
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              )}
            </div>

            <div className="my-1 h-px bg-border" />

            <Menu.LinkItem render={<Link href="/settings" />} className={itemClass}>
              <Settings className="h-4 w-4 text-muted-foreground" />
              Settings
            </Menu.LinkItem>

            <div className="my-1 h-px bg-border" />

            <Menu.Item onClick={signOut} className={itemClass}>
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
