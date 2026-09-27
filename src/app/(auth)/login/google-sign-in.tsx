"use client";

import { useState } from "react";
import { authClient } from "@/app/modules/auth/auth-client";
import styles from "../auth.generated.module.css";

export function GoogleSignIn({ next, enabled }: { next: string; enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignIn() {
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: next });
      if (result.error) setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return <>
    <button className={styles.googleButton} type="button" onClick={handleSignIn} disabled={!enabled || pending}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.2 3-7.3Z"/>
        <path fill="#34A853" d="M12 22c2.7 0 5-1 6.6-2.5l-3.2-2.5c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/>
        <path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8l3.3-2.6Z"/>
        <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.6l3.3 2.6A6 6 0 0 1 12 6.1Z"/>
      </svg>
      {pending ? "Abriendo Google…" : "Continuar con Google"}
    </button>
    {error && <p className={styles.error} role="alert">No pudimos iniciar sesión. Inténtalo de nuevo o verifica que tu cuenta esté autorizada.</p>}
  </>;
}
