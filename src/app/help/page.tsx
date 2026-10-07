import styles from "@/app/creative-draft-workspace.generated.module.css";
import Link from "next/link";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";
import { connection } from "next/server";
import { requirePageAccess } from "@/app/modules/auth/access";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topicId?: string | string[] }> }) {
  await connection();
  await requirePageAccess("/help");
  const query = await searchParams;
  const topicId = typeof query.topicId === "string" ? query.topicId : undefined;
  const topic = topicId ? await getTopicById(topicId) : undefined;
  const themeStyle = topic ? await resolveTopicUiTheme(topic.id, topic.themeKey) : undefined;
  const topicQuery = topicId ? `?topicId=${encodeURIComponent(topicId)}` : "";
  return <main className={styles.routeShell} style={themeStyle}>
    <div className={styles.routeTopbar}><Link href={`/${topicQuery}#today`}>← <span>Press Craftor</span></Link><span className={styles.routeBreadcrumb}>{topic?.name ? `${topic.name} / ` : ""}Help</span></div>
    <article className={styles.helpContent}>
      <p>Quick guide</p>
      <h1>From source material to publication</h1>
      <ol>
        <li><strong>Set up your brand.</strong> Start in <Link href={`/${topicQuery}#topics`}>Manage Topics</Link>, then review Creative identity, Editorial strategy, Sources, and Channels.</li>
        <li><strong>Find a Story.</strong> Open <Link href={`/${topicQuery}#discover`}>Discover</Link> to collect, evaluate, and select material. Approving a Story for production does not approve its script or publish it.</li>
        <li><strong>Review a version.</strong> Open <Link href={`/${topicQuery}#production`}>Production</Link>, then review Content, Focus, Script, Visuals, and Publication in the Story workspace. Script, image, and publication approvals are separate.</li>
        <li><strong>Recover publication work.</strong> Check <Link href={`/${topicQuery}#publications/history`}>Publication history</Link> and the Story’s Publication stage. If delivery is uncertain, reconcile the existing job before trying to send again.</li>
      </ol>
      <p>Instagram is currently the available publishing channel. Manage its connection in <Link href={`/${topicQuery}#channels`}>Channels</Link>.</p>
      <Link href={`/${topicQuery}#today`}>Back to Today →</Link>
    </article>
  </main>;
}
