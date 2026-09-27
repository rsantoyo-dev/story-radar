"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/app/modules/auth/auth-client";
import styles from "./auth.generated.module.css";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return <button type="button" className={styles.signOutButton} disabled={pending} onClick={async () => {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }}>{failed ? "Reintentar cierre de sesión" : pending ? "Cerrando sesión…" : "Cerrar sesión"}</button>;
}
