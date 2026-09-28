"use client";

import { useEffect } from "react";

/** The browser provides the warning text for reloads and cross-page exits. */
export function useUnsavedBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
