"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { SignOutButton } from "./account/sign-out-button";
import { AddSourceDialog } from "./add-source-dialog";
import { CreativeProfilePanel, type CreativeProfileSection } from "./creative-profile-panel";
import { FacebookConnectionPanel } from "./facebook-connection-panel";
import { MetaConnectionPanel } from "./meta-connection-panel";
import { SIGNED_IN_CREDENTIAL } from "./modules/auth/session-credential";
import type { TopicSetupStatus } from "./modules/topics/topic-setup.core";
import styles from "./radar-dashboard.generated.module.css";

type Step = "identity" | "sources" | "channels" | "finish";

const STEPS: { id: Step; title: string; summary: string }[] = [
  { id: "identity", title: "Identity", summary: "Who the brand is" },
  { id: "sources", title: "Sources", summary: "Where stories come from" },
  { id: "channels", title: "Channels", summary: "Where it publishes" },
  { id: "finish", title: "Ready", summary: "Open the studio" },
];

const IDENTITY_SECTIONS: { id: CreativeProfileSection; label: string }[] = [
  { id: "profile", label: "Basics" },
  { id: "voice", label: "Voice" },
  { id: "visual", label: "Colors" },
  { id: "assets", label: "Logo & references" },
];

function stepDone(status: TopicSetupStatus, step: Step): boolean {
  if (step === "identity") return status.identity.done;
  if (step === "sources") return status.sources.done;
  if (step === "channels") return status.channels.done;
  return status.completed;
}

function firstOpenStep(status: TopicSetupStatus): Step {
  return status.nextStep === "done" || status.nextStep === "finish" ? "finish" : status.nextStep;
}

/**
 * A brand opens the studio only after its guided setup: identity, sources and
 * channels, one step at a time, resumable. Each step embeds the screen that
 * owns that configuration; "Continue" unlocks once the step is really done.
 */
export function TopicSetupWizard({ topic, topics, account, themeStyle, initialStatus, meta }: {
  topic: { id: string; name: string };
  topics: { id: string; name: string; ready: boolean }[];
  account: { email: string; name?: string; workspaceName?: string; role?: string };
  themeStyle: CSSProperties;
  initialStatus: TopicSetupStatus;
  meta: { facebookSelectionId?: string; connected?: boolean; error?: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [step, setStep] = useState<Step>(() => meta.facebookSelectionId || meta.connected || meta.error ? "channels" : firstOpenStep(initialStatus));
  const [identitySection, setIdentitySection] = useState<CreativeProfileSection>("profile");
  const [addingSource, setAddingSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | undefined>(
    meta.error ? { tone: "error", text: meta.error } : meta.connected ? { tone: "info", text: "Connected. Check the account below, then continue." } : undefined,
  );
  const [facebookSelectionId, setFacebookSelectionId] = useState(meta.facebookSelectionId);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/radar/topics/${encodeURIComponent(topic.id)}/setup`, { cache: "no-store" }).catch(() => undefined);
    if (!response?.ok) return undefined;
    const body = await response.json() as { setup: TopicSetupStatus };
    setStatus(body.setup);
    return body.setup;
  }, [topic.id]);

  // A Facebook or Instagram connection finishes in another window or after a redirect: re-check on return.
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // The Meta return parameters are handled once; keep the URL clean.
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ["metaTopicId", "metaConnected", "metaError", "metaChannel", "metaFacebookSelectionId"]) {
      if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
    }
    if (changed) {
      url.searchParams.set("topicId", topic.id);
      window.history.replaceState(null, "", url.toString());
    }
  }, [topic.id]);

  async function post(action: "confirm-identity" | "complete"): Promise<TopicSetupStatus | undefined> {
    setBusy(true);
    setNotice(undefined);
    const response = await fetch(`/api/radar/topics/${encodeURIComponent(topic.id)}/setup`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    }).catch(() => undefined);
    const body = await response?.json().catch(() => ({})) as { setup?: TopicSetupStatus; error?: string } | undefined;
    setBusy(false);
    if (!response?.ok || !body?.setup) {
      setNotice({ tone: "error", text: body?.error ?? "That did not work. Try again." });
      await refresh();
      return undefined;
    }
    setStatus(body.setup);
    return body.setup;
  }

  async function continueFrom(current: Step) {
    if (current === "identity") {
      const next = await post("confirm-identity");
      if (next?.identity.done) setStep("sources");
      return;
    }
    const next = await refresh();
    if (!next) return;
    if (current === "sources" && next.sources.done) setStep("channels");
    else if (current === "channels" && next.channels.done) setStep("finish");
    else setNotice({ tone: "error", text: current === "sources" ? "Add at least one source first." : "Connect a Facebook Page or an Instagram account first." });
  }

  async function finish() {
    const done = await post("complete");
    if (done?.completed) { router.push(`/?topicId=${encodeURIComponent(topic.id)}`); router.refresh(); }
  }

  const reachable = (target: Step) => {
    const order = STEPS.map((item) => item.id);
    return order.slice(0, order.indexOf(target)).every((previous) => previous === "finish" || stepDone(status, previous));
  };

  return <main className={styles.setupPage} style={themeStyle}>
    <header className={styles.setupHeader}>
      <div>
        <span>Press Craftor · {account.workspaceName ?? "Your workspace"}</span>
        <h1>Set up {topic.name}</h1>
      </div>
      <div className={styles.setupHeaderActions}>
        {topics.length > 1 ? <label className={styles.setupBrandSwitch}>
          <span>Brand</span>
          <select value={topic.id} onChange={(event) => router.push(`/?topicId=${encodeURIComponent(event.target.value)}`)}>
            {topics.map((item) => <option key={item.id} value={item.id}>{item.name}{item.ready ? "" : " · setting up"}</option>)}
          </select>
        </label> : null}
        <span className={styles.setupAccount} title={account.email}>{account.email}</span>
        <SignOutButton size="compact" />
      </div>
    </header>

    <ol className={styles.setupSteps} aria-label="Setup steps">
      {STEPS.map((item, index) => {
        const done = stepDone(status, item.id);
        const current = item.id === step;
        const open = reachable(item.id);
        return <li key={item.id} aria-current={current ? "step" : undefined} data-state={done ? "done" : current ? "current" : open ? "open" : "locked"}>
          <button type="button" disabled={!open || busy} onClick={() => { setNotice(undefined); setStep(item.id); }}>
            <b aria-hidden="true">{done ? "✓" : index + 1}</b>
            <span><strong>{item.title}</strong><small>{done ? "Done" : open ? item.summary : "Locked until the previous step"}</small></span>
          </button>
        </li>;
      })}
    </ol>

    {notice ? <p className={styles.setupNotice} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p> : null}

    {step === "identity" ? <section className={styles.setupStep} aria-labelledby="setup-identity">
      <div className={styles.setupIntro}>
        <h2 id="setup-identity">1. Who is {topic.name}?</h2>
        <p>Everything Press Craftor writes and draws follows this identity. Set the language, region and audience, describe the voice, pick the colors and upload the logo. Save each tab, then continue.</p>
        {status.identity.missing.length ? <ul className={styles.setupMissing}>{status.identity.missing.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p className={styles.setupOk}>The identity has everything it needs. Review it and continue.</p>}
      </div>
      <nav className={styles.setupTabs} aria-label="Identity sections">
        {IDENTITY_SECTIONS.map((section) => <button key={section.id} type="button" aria-pressed={identitySection === section.id} onClick={() => setIdentitySection(section.id)}>{section.label}</button>)}
      </nav>
      <div className={styles.setupPanel}>
        <CreativeProfilePanel key={`${topic.id}-${identitySection}`} topicId={topic.id} secret={SIGNED_IN_CREDENTIAL} disabled={busy}
          section={identitySection} onProfileSaved={() => void refresh()} />
      </div>
      <footer className={styles.setupFooter}>
        <button type="button" className={styles.setupPrimary} disabled={busy} onClick={() => void continueFrom("identity")}>{busy ? "Checking…" : "Confirm identity and continue"}</button>
      </footer>
    </section> : null}

    {step === "sources" ? <section className={styles.setupStep} aria-labelledby="setup-sources">
      <div className={styles.setupIntro}>
        <h2 id="setup-sources">2. Where do {topic.name}&rsquo;s stories come from?</h2>
        <p>Add at least one source: a news feed or website (RSS is detected for you), or a document such as a PDF report. You can add AI research and more feeds later from Sources.</p>
        <p className={status.sources.done ? styles.setupOk : undefined}>{status.sources.count === 0 ? "No sources yet." : `${status.sources.count} ${status.sources.count === 1 ? "source" : "sources"} linked.`}</p>
      </div>
      <div className={styles.setupPanel}>
        <button type="button" className={styles.setupSecondary} disabled={busy} onClick={() => setAddingSource(true)}>Add a feed, website or document</button>
      </div>
      {addingSource ? <AddSourceDialog topics={[{ id: topic.id, name: topic.name }]} initialTopicId={topic.id} secret={SIGNED_IN_CREDENTIAL}
        onClose={() => { setAddingSource(false); void refresh(); }}
        onCreated={() => { setAddingSource(false); setNotice({ tone: "info", text: "Source added." }); void refresh(); }} /> : null}
      <footer className={styles.setupFooter}>
        <button type="button" className={styles.setupGhost} disabled={busy} onClick={() => setStep("identity")}>Back</button>
        <button type="button" className={styles.setupPrimary} disabled={busy || !status.sources.done} onClick={() => void continueFrom("sources")}>Continue</button>
      </footer>
    </section> : null}

    {step === "channels" ? <section className={styles.setupStep} aria-labelledby="setup-channels">
      <div className={styles.setupIntro}>
        <h2 id="setup-channels">3. Where does {topic.name} publish?</h2>
        <p>Connect the brand&rsquo;s Facebook Page; its linked Instagram account publishes through it. You can connect Instagram directly instead.</p>
        <p className={status.channels.done ? styles.setupOk : undefined}>{status.channels.via === "facebook" ? "Facebook Page connected." : status.channels.via === "instagram" ? "Instagram connected." : "No channel connected yet."}</p>
      </div>
      <div className={styles.setupPanel}>
        <FacebookConnectionPanel topicId={topic.id} secret={SIGNED_IN_CREDENTIAL} disabled={busy} selectionId={facebookSelectionId}
          onSelectionHandled={() => { setFacebookSelectionId(undefined); void refresh(); }} />
        <details className={styles.setupAlternative}>
          <summary>Or connect Instagram directly</summary>
          <MetaConnectionPanel topicId={topic.id} secret={SIGNED_IN_CREDENTIAL} disabled={busy} onConnectionChanged={() => void refresh()} />
        </details>
      </div>
      <footer className={styles.setupFooter}>
        <button type="button" className={styles.setupGhost} disabled={busy} onClick={() => setStep("sources")}>Back</button>
        <button type="button" className={styles.setupPrimary} disabled={busy || !status.channels.done} onClick={() => void continueFrom("channels")}>Continue</button>
      </footer>
    </section> : null}

    {step === "finish" ? <section className={styles.setupStep} aria-labelledby="setup-finish">
      <div className={styles.setupIntro}>
        <h2 id="setup-finish">{status.readyToComplete ? `${topic.name} is ready` : "Almost there"}</h2>
        <ul className={styles.setupSummary}>
          <li data-done={status.identity.done}>Identity {status.identity.done ? "confirmed" : "to finish"}</li>
          <li data-done={status.sources.done}>{status.sources.count} {status.sources.count === 1 ? "source" : "sources"}</li>
          <li data-done={status.channels.done}>{status.channels.via === "facebook" ? "Facebook Page" : status.channels.via === "instagram" ? "Instagram" : "No channel"} {status.channels.done ? "connected" : "yet"}</li>
        </ul>
        <p>Next: Today collects and ranks this brand&rsquo;s stories. Pick one and Press Craftor drafts it, designs it, and waits for your approval before publishing.</p>
      </div>
      <footer className={styles.setupFooter}>
        <button type="button" className={styles.setupGhost} disabled={busy} onClick={() => setStep("channels")}>Back</button>
        <button type="button" className={styles.setupPrimary} disabled={busy || !status.readyToComplete} onClick={() => void finish()}>{busy ? "Opening…" : "Open the studio"}</button>
      </footer>
    </section> : null}
  </main>;
}
