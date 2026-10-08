"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/app/modules/auth/auth-client";
import { Button } from "@/app/ui/primitives";

export function SignOutButton({ size = "regular" }: { size?: "compact" | "regular" }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <Button size={size} busy={busy} onClick={async () => {
    setBusy(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }}>Sign out</Button>;
}
