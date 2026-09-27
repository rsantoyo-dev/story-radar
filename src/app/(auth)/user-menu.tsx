"use client";

import { useSession } from "@/app/modules/auth/auth-client";
import Image from "next/image";
import { SignOutButton } from "./sign-out-button";
import styles from "./auth.generated.module.css";

export function UserMenu() {
  const { data } = useSession();
  if (!data?.user) return null;
  return <details className={styles.userMenu}>
    <summary aria-label={`Cuenta de ${data.user.name || data.user.email}`}>
      {data.user.image && <Image unoptimized src={data.user.image} alt="" width={24} height={24} />}
      <span>{data.user.name || data.user.email}</span>
    </summary>
    <div className={styles.userMenuPanel}>
      <span>{data.user.email}</span>
      <SignOutButton />
    </div>
  </details>;
}
