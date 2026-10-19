"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import Link from "next/link";
import { StoryInstagramResults } from "@/app/story-instagram-results";
import styles from "@/app/creative-draft-workspace.generated.module.css";
import canvas from "@/app/draft-2-canvas.generated.module.css";
import { SIGNED_IN_CREDENTIAL } from "@/app/modules/auth/session-credential";
import { dashboardHref, draft2StepHref } from "@/app/draft-2-canvas.core";
import { LinkButton } from "@/app/ui/primitives";

/**
 * A story published with the earlier studio (2026-10-19, the studio retired:
 * "the old links stay alive but are not shown, except on stories already
 * published"): its Instagram results, and the way into Draft 2 for anything
 * new. Nothing is generated or published from here.
 */
export function PublishedStoryPageClient({ signedIn = false, topicId, topicName, themeStyle, storyId, from, returnContext }: {
  signedIn?: boolean;
  topicId: string;
  topicName: string;
  themeStyle: CSSProperties;
  storyId: string;
  from?: string;
  returnContext?: string;
}) {
  const [secret] = useState(() => {
    if (typeof window === "undefined" || signedIn) return "";
    try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
    catch { return ""; }
  });
  const [title, setTitle] = useState<string>();
  const [error, setError] = useState<string>();
  const router = useRouter();
  const back = dashboardHref(topicId, { from, returnContext });
  const credential = signedIn ? SIGNED_IN_CREDENTIAL : secret;
  // Without a session or the collector secret nothing can be read: said in render, never set in an effect.
  const unsigned = !signedIn && !secret;
  useEffect(() => {
    if (unsigned) return;
    const controller = new AbortController();
    fetch(`/api/radar/stories/${encodeURIComponent(storyId)}/content?topicId=${encodeURIComponent(topicId)}`, { headers: { Authorization: `Bearer ${credential}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not open the story."); return body as { title: string }; })
      .then((body) => { if (!controller.signal.aborted) setTitle(body.title); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the story."); });
    return () => controller.abort();
  }, [credential, storyId, topicId, unsigned]);
  return <main className={styles.routeShell} style={themeStyle}>
    <div className={styles.routeTopbar}>
      <Link href={back} aria-label="Back to list">← <span>Press Craftor</span></Link>
      <span className={styles.routeBreadcrumb}>{topicName} <span aria-hidden="true">/</span> Published <span aria-hidden="true">/</span> Story</span>
      <LinkButton size="compact" href={draft2StepHref(topicId, storyId, undefined, { from, returnContext })} title="Open this story in Draft 2">Draft 2</LinkButton>
    </div>
    {error || unsigned ? <div className={styles.routeError} role="alert"><strong>Could not open the story</strong><p>{error ?? "Sign in to open the story."}</p><Link href={back}>Back to dashboard</Link></div> : null}
    {title ? <section className={canvas.publishedBody}>
      <h1>{title}</h1>
      <p>Published with the earlier studio. Its Instagram results are below; anything new for this story is written in Draft 2.</p>
      <StoryInstagramResults topicId={topicId} storyId={storyId} secret={credential} disabled={false} onGoToConnectionPanel={() => router.push(dashboardHref(topicId, { from: "#channels" }))} />
    </section> : null}
  </main>;
}
