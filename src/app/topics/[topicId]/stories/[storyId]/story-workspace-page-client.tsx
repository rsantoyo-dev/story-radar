"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreativeDraftWorkspace, type WorkspaceTab } from "@/app/creative-draft-workspace";
import { StoryContentViewer, type StoryContentResponse } from "@/app/radar-dashboard";
import styles from "@/app/creative-draft-workspace.generated.module.css";
import { SIGNED_IN_CREDENTIAL } from "@/app/modules/auth/session-credential";
import { draft2Href } from "@/app/draft-2-canvas.core";
import { LinkButton } from "@/app/ui/primitives";

const WORKSPACE_TABS: readonly WorkspaceTab[] = ["content", "focus", "script", "visuals", "publication"];

function returnHref(topicId: string, from?: string, returnContext?: string): string {
  const section = from?.startsWith("#") && !from.startsWith("#story/") ? from : "#production";
  const context = returnContext && /^[0-9a-f-]{36}$/i.test(returnContext)
    ? `&returnContext=${encodeURIComponent(returnContext)}` : "";
  return `/?topicId=${encodeURIComponent(topicId)}${context}${section}`;
}

export function StoryWorkspacePageClient({
  signedIn = false, topicId, topicName, themeStyle, storyId, from, returnContext, initialTab,
  initialDraftId, initialEditorialRunId, initialPreparationRunId,
}: {
  /** A signed-in session authorizes every request; the collector secret is not needed. */
  signedIn?: boolean;
  topicId: string;
  topicName: string;
  themeStyle: CSSProperties;
  storyId: string;
  from?: string;
  returnContext?: string;
  initialTab?: string;
  initialDraftId?: string;
  initialEditorialRunId?: string;
  initialPreparationRunId?: string;
}) {
  const router = useRouter();
  const [secret] = useState(() => {
    if (typeof window === "undefined" || signedIn) return "";
    try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
    catch { return ""; }
  });
  const [content, setContent] = useState<StoryContentResponse>();
  const [error, setError] = useState<string>();
  const [contentOpen, setContentOpen] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [workspaceNonce, setWorkspaceNonce] = useState(0);
  const [instagramRefreshToken, setInstagramRefreshToken] = useState(0);
  const back = returnHref(topicId, from, returnContext);
  const tab = WORKSPACE_TABS.find((candidate) => candidate === initialTab) ?? "focus";

  useEffect(() => {
    if (!secret && !signedIn) {
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
  }, [secret, signedIn, storyId, topicId]);

  return <main className={styles.routeShell} style={themeStyle}>
    <div className={styles.routeTopbar}>
      {content && !error ? <strong className={styles.routeBrand}>Press Craftor</strong> : <Link href={back} aria-label="Back to list">← <span>Press Craftor</span></Link>}
      <span className={styles.routeBreadcrumb}>{topicName} <span aria-hidden="true">/</span> Production <span aria-hidden="true">/</span> Story</span>
      {/* The second pipeline grows beside this studio; the canvas opens the same story. */}
      <LinkButton size="compact" href={draft2Href(topicId, storyId, { from, returnContext })} title="Open this story in the Draft 2 canvas">Draft 2</LinkButton>
    </div>
    {error ? <div className={styles.routeError} role="alert"><strong>Could not open the studio</strong><p>{error}</p><Link href={back}>Back to dashboard</Link></div> : null}
    {!content && !error ? <div className={styles.routeLoading} role="status">Loading story…</div> : null}
    {contentSaved ? <div className={styles.routeRefresh} role="status"><span>The content revision was saved. Save your current script edits before reloading the focus and script against it. Earlier approved versions and images remain available.</span><button type="button" onClick={() => { if (!workspaceDirty || window.confirm("Reloading the studio will discard unsaved script changes. Continue?")) { setWorkspaceNonce((current) => current + 1); setContentSaved(false); } }}>Reload updated content</button></div> : null}
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
      secret={signedIn ? SIGNED_IN_CREDENTIAL : secret}
      onClose={() => router.push(back)}
      onOpenContent={() => setContentOpen(true)}
      contentSummary={content}
      onDraftDirtyChange={setWorkspaceDirty}
      instagramRefreshToken={instagramRefreshToken}
      onInstagramChanged={() => setInstagramRefreshToken((current) => current + 1)}
    /> : null}
    {contentOpen && content ? <StoryContentViewer
      key={`${topicId}:${storyId}:${content.editorial?.revision ?? 0}`}
      content={content}
      secret={signedIn ? SIGNED_IN_CREDENTIAL : secret}
      topicId={topicId}
      onSaved={(saved) => { setContent(saved); if (workspaceDirty) setContentSaved(true); else { setWorkspaceNonce((current) => current + 1); setContentSaved(false); } }}
      onClose={() => setContentOpen(false)}
    /> : null}
  </main>;
}
