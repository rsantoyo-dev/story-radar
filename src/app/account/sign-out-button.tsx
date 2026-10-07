"use client";

import { useState } from "react";

import { signOut } from "@/app/modules/auth/auth-client";
import { Button } from "@/app/ui/primitives";

export function SignOutButton({ size = "regular" }: { size?: "compact" | "regular" }) {
  const [busy, setBusy] = useState(false);
  return <Button size={size} busy={busy} onClick={async () => {
    setBusy(true);
    await signOut();
    window.location.assign("/login");
  }}>Sign out</Button>;
}
