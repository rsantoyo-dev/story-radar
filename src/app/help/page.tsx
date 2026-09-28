import styles from "@/app/creative-draft-workspace.generated.module.css";
import Link from "next/link";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topicId?: string | string[] }> }) {
  const query = await searchParams;
  const topicId = typeof query.topicId === "string" ? query.topicId : undefined;
  const topicQuery = topicId ? `?topicId=${encodeURIComponent(topicId)}` : "";
  return <main className={styles.routeShell}>
    <div className={styles.routeTopbar}><Link href={`/${topicQuery}#today`}>← <span>Press Craftor</span></Link><span className={styles.routeBreadcrumb}>Help</span></div>
    <article className={styles.helpContent}>
      <p>Quick guide</p>
      <h1>From source material to publication</h1>
      <ol>
        <li><strong>Set up your brand.</strong> Choose a Topic and review Creative identity, Editorial strategy, Sources, and Channels.</li>
        <li><strong>Discover stories.</strong> Search for content, evaluate candidates, and approve the ones you want to produce.</li>
        <li><strong>Work in the studio.</strong> Review Content and Focus, prepare the Script, approve Images, and check Publication.</li>
        <li><strong>Pick up where you left off.</strong> Today shows your daily workflow, while Production gathers selected stories.</li>
      </ol>
      <p>Instagram is currently the available publishing channel. Manage its connection in <Link href={`/${topicQuery}#channels`}>Channels</Link>.</p>
      <Link href={`/${topicQuery}#today`}>Back to Today →</Link>
    </article>
  </main>;
}
