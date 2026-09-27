import styles from "./auth.generated.module.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.authShell}>{children}</main>;
}
