"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// True once the component has hydrated on the client; false during SSR and the
// initial hydration render. Lets theme-dependent UI stay neutral until the
// client knows the resolved theme, avoiding hydration mismatches.
//
// useSyncExternalStore is the idiomatic way to detect hydration: it returns the
// server snapshot (false) for the hydration render, then the client snapshot
// (true) — same effect as a useState+useEffect mount flag, but without a
// setState-in-effect (so no cascading-render lint warning).
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  );
}
