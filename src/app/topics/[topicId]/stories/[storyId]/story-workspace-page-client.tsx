"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { topicThemeStyle } from "@/design/topic-themes";
import { CreativeDraftWorkspace, type WorkspaceTab } from "@/app/creative-draft-workspace";
import { StoryContentViewer, type StoryContentResponse } from "@/app/radar-dashboard";
import styles from "@/app/creative-draft-workspace.generated.module.css";

const WORKSPACE_TABS: readonly WorkspaceTab[] = ["content", "focus", "script", "visuals", "publication"];

function returnHref(topicId: string, from?: string): string {
  const section = from?.startsWith("#") && !from.startsWith("#story") ? from : "#production";
  return `/?topicId=${encodeURIComponent(topicId)}${section}`;
}

export function StoryWorkspacePageClient({
  topicId, topicName, topicThemeKey, storyId, from, initialTab,
  initialDraftId, initialEditorialRunId, initialPreparationRunId,
}: {
  topicId: string;
  topicName: string;
  topicThemeKey: string;
  storyId: string;
  from?: string;
  initialTab?: string;
  initialDraftId?: string;
  initialEditorialRunId?: string;
  initialPreparationRunId?: string;
}) {
  const router = useRouter();
  const [secret] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
    catch { return ""; }
  });
  const [content, setContent] = useState<StoryContentResponse>();
  const [error, setError] = useState<string>();
  const [contentOpen, setContentOpen] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const [workspaceNonce, setWorkspaceNonce] = useState(0);
  const [instagramRefreshToken, setInstagramRefreshToken] = useState(0);
  const back = returnHref(topicId, from);
  const tab = WORKSPACE_TABS.find((candidate) => candidate === initialTab) ?? "focus";

  useEffect(() => {
    if (!secret) {
      Promise.resolve().then(() => setError("Connect with the collector secret on the dashboard to open this story."));
      return;
    }
    const controller = new AbortController();
    fetch(`/api/radar/stories/${encodeURIComponent(storyId)}/content?topicId=${encodeURIComponent(topicId)}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${secret}` },
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not open the story.");
      return body as StoryContentResponse;
    }).then((result) => {
      if (!controller.signal.aborted) setContent(result);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the story.");
    });
    return () => controller.abort();
  }, [secret, storyId, topicId]);

  return <main className={styles.routeShell} style={topicThemeStyle(topicThemeKey)}>
    <div className={styles.routeTopbar}>
      {content && !error ? <strong className={styles.routeBrand}>Press Craftor</strong> : <Link href={back} aria-label="Back to list">← <span>Press Craftor</span></Link>}
      <span className={styles.routeBreadcrumb}>{topicName} <span aria-hidden="true">/</span> Production <span aria-hidden="true">/</span> Story</span>
    </div>
    {error ? <div className={styles.routeError} role="alert"><strong>Could not open the studio</strong><p>{error}</p><Link href={back}>Back to dashboard</Link></div> : null}
    {!content && !error ? <div className={styles.routeLoading} role="status">Loading story…</div> : null}
    {contentSaved ? <div className={styles.routeRefresh} role="status"><span>The content changed. Refresh the studio to review the focus and script against this revision.</span><button type="button" onClick={() => { if (window.confirm("Refreshing the studio will discard unsaved script changes. Continue?")) { setWorkspaceNonce((current) => current + 1); setContentSaved(false); } }}>Refresh studio</button></div> : null}
    {content && !error ? <CreativeDraftWorkspace
      key={`${topicId}:${storyId}:${workspaceNonce}`}
      mode="page"
      initialTab={tab}
      initialDraftId={initialDraftId}
      initialEditorialRunId={initialEditorialRunId}
      initialPreparationRunId={initialPreparationRunId}
      topicId={topicId}
      storyId={storyId}
      storyTitle={content.title}
      secret={secret}
      onClose={() => router.push(back)}
      onOpenContent={() => setContentOpen(true)}
      instagramRefreshToken={instagramRefreshToken}
      onInstagramChanged={() => setInstagramRefreshToken((current) => current + 1)}
    /> : null}
    {contentOpen && content ? <StoryContentViewer
      key={`${topicId}:${storyId}:${content.editorial?.revision ?? 0}`}
      content={content}
      secret={secret}
      topicId={topicId}
      onSaved={(saved) => { setContent(saved); setContentSaved(true); }}
      onClose={() => setContentOpen(false)}
    /> : null}
  </main>;
}
