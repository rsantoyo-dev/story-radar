import { redirect } from "next/navigation";
import { getSession } from "@/app/modules/auth/session-context";
import { SignOutButton } from "../sign-out-button";
import styles from "../auth.generated.module.css";

export default async function NoAccessPage() {
  if (!(await getSession())) redirect("/login");
  return <section className={styles.authCard} aria-labelledby="no-access-title">
    <span className={styles.eyebrow}>STORY RADAR</span>
    <h1 id="no-access-title">Sin espacio de trabajo</h1>
    <p>Tu cuenta aún no tiene acceso a un espacio de trabajo. Contacta a quien administra tu cuenta.</p>
    <SignOutButton />
  </section>;
}
