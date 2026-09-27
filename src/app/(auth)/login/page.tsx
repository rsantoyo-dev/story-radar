import { redirect } from "next/navigation";
import { getSession } from "@/app/modules/auth/session-context";
import { isGoogleSignInConfigured } from "@/app/modules/auth/auth";
import { safeNextPath } from "../safe-next";
import { GoogleSignIn } from "./google-sign-in";
import styles from "../auth.generated.module.css";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  if (await getSession()) redirect(next);
  const googleConfigured = isGoogleSignInConfigured();

  return <section className={styles.authCard} aria-labelledby="login-title">
    <span className={styles.eyebrow}>STORY RADAR · ALFA</span>
    <h1 id="login-title">Tus historias, listas para publicar.</h1>
    <p>Entra con tu cuenta de Google para gestionar tu espacio de trabajo y tus publicaciones.</p>
    <GoogleSignIn next={next} enabled={googleConfigured} />
    {!googleConfigured && <p role="status" className={styles.hint}>El acceso con Google aún no está configurado en este entorno.</p>}
    <p className={styles.hint}>Durante la alfa, Google limita el acceso a las cuentas de prueba autorizadas.</p>
  </section>;
}
