"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PlannerChoice, PlannerView } from "./modules/stories/daily-editorial-planner.types";
import styles from "./radar-dashboard.generated.module.css";

const subscribeTimezone = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "UTC";

export function DailyEditorialPlannerPanel({topicId,secret,disabled,refreshKey,onViewContent,onPrepareContent,onSelect,preparingStoryId}:{
  topicId:string;secret:string;disabled:boolean;refreshKey:unknown;onViewContent:(id:string)=>void;
  onPrepareContent:(id:string)=>void;
  onSelect:(id:string,title:string,decision:"review"|"shortlist")=>Promise<void>;
  preparingStoryId?:string;
}) {
  const deviceTimezone=useSyncExternalStore(subscribeTimezone,browserTimezone,serverTimezone);
  const [timezoneOverride,setTimezone]=useState("");
  const timezone=timezoneOverride || deviceTimezone;
  const [timezoneInput,setTimezoneInput]=useState<string>();
  const [view,setView]=useState<PlannerView>();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [approvingId,setApprovingId]=useState<string>();
  const [approvalMessage,setApprovalMessage]=useState<{storyId:string;text:string;failed:boolean}>();
  const generation=useRef(0);
  const active=useRef<AbortController | null>(null);
  const posting=useRef(false);
  const load=useCallback(async (generate=false,force=false) => {
    if (!timezone || !secret || !topicId || (!generate && posting.current)) return;
    active.current?.abort();
    const controller=new AbortController();active.current=controller;
    const requestId=++generation.current;
    if(generate) posting.current=true;
    setBusy(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-planner?topicId=${encodeURIComponent(topicId)}&timezone=${encodeURIComponent(timezone)}`,{
        method:generate?"POST":"GET",cache:"no-store",signal:controller.signal,
        headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},
        ...(generate?{body:JSON.stringify({force})}:{}),
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || "The daily planner could not be loaded");
      if(requestId===generation.current) setView(data);
    } catch(e) {
      if(requestId===generation.current && !controller.signal.aborted) setError(e instanceof Error?e.message:"The daily planner could not be loaded");
    } finally {
      if(requestId===generation.current) {setBusy(false);posting.current=false;}
    }
  },[topicId,secret,timezone]);
  useEffect(() => {
    const requests=generation;
    const refresh=()=> {if(document.visibilityState==="visible") void load();};
    window.addEventListener("focus",refresh);
    const timer=setInterval(refresh,60000);
    return () => {clearInterval(timer);window.removeEventListener("focus",refresh);active.current?.abort();++requests.current;posting.current=false;};
  },[load]);
  useEffect(() => {
    const initial=setTimeout(()=>void load(),0);
    return ()=>clearTimeout(initial);
  },[refreshKey,load]);
  const result=view?.saved?.result;
  async function approve(item: PlannerChoice) {
    const current=view?.context.candidates.find(c=>c.storyId===item.storyId);
    if (!current?.decision || approvingId) return;
    setApprovingId(item.storyId);
    setApprovalMessage(undefined);
    try {
      await onSelect(item.storyId,current.title,current.decision);
      setApprovalMessage({storyId:item.storyId,text:"Approved. The story is ready for the creative workflow.",failed:false});
      await load();
    } catch (error) {
      setApprovalMessage({storyId:item.storyId,text:error instanceof Error ? error.message : "Approval failed. Please try again.",failed:true});
    } finally { setApprovingId(undefined); }
  }
  const snapshot=view?.saved?.context;
  function choice(item:PlannerChoice,label:string) {
    const candidate=snapshot?.candidates.find(c=>c.storyId===item.storyId);
    const current=view?.context.candidates.find(c=>c.storyId===item.storyId);
    const actionsDisabled=disabled || busy || !!view?.running || !!approvingId || !!error || !current;
    const approved=current?.selected || (approvalMessage?.storyId===item.storyId && !approvalMessage.failed);
    return <article key={item.storyId} className={styles.dailyPlannerChoice}>
      <span className={styles.eyebrow}>{label}</span>
      <h3>{candidate?.title ?? "Story"}</h3><p>{item.reason}</p>
      {candidate && <small>Editorial priority {candidate.editorialPriority} · Growth {candidate.growthScore ?? "not evaluated"}</small>}
      <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.secondaryButton} disabled={actionsDisabled} onClick={()=>onViewContent(item.storyId)}>View content</button>
        <button type="button" className={styles.secondaryButton} disabled={actionsDisabled} onClick={()=>onPrepareContent(item.storyId)}>{preparingStoryId===item.storyId ? "Preparing…" : "Prepare content"}</button>
        <button type="button" className={styles.primaryButton} disabled={actionsDisabled || approved || !current?.decision} onClick={()=>void approve(item)}>{approvingId===item.storyId ? "Approving…" : approved ? "Approved" : "Approve"}</button>
      </div>
      {approvalMessage?.storyId===item.storyId && <p role={approvalMessage.failed ? "alert" : "status"}>{approvalMessage.text}</p>}
    </article>;
  }
  return <section className={styles.dailyPlanner} aria-label="Daily editorial planner">
    <div className={styles.dailyPlannerHeader}>
      <div><span className={styles.eyebrow}>Daily editorial planner</span><h2>What should we publish today?</h2>
        <p>Compare evaluated stories with your last 10 confirmed publications and upcoming posts. Original scores stay unchanged.</p></div>
      <div className={styles.dailyPlannerControls}>
        <label>Timezone<input aria-label="Planner timezone" value={timezoneInput ?? timezone} disabled={busy || view?.running} onChange={event=>setTimezoneInput(event.target.value)} placeholder="America/Toronto" /></label>
        {timezoneInput!==undefined && timezoneInput!==timezone && <button type="button" className={styles.secondaryButton} disabled={busy || view?.running} onClick={()=>{setView(undefined);setTimezone(timezoneInput!.trim());}}>Apply timezone</button>}
        <button type="button" className={styles.primaryButton} disabled={disabled || busy || !timezone || view?.running} onClick={()=>void load(true,!!view?.saved)}>
          {busy || view?.running ? "Checking today’s plan…" : view?.saved ? "Refresh recommendation" : "Recommend for today"}
        </button>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {view && <p>{view.context.weekday}, {view.context.localDate} · {view.context.timezone} · {view.context.candidates.length} eligible candidates · {view.context.recentPublications.length} recent publications</p>}
    {view?.stale && <p role="status">This recommendation is out of date. The day, profile, candidates or publishing history changed. Refresh to compare the recommendations again. Eligible stories can still be prepared or approved.</p>}
    {view?.saved?.status==="interrupted" && <p role="status">The previous run was interrupted. Refresh to try again.</p>}
    {view?.saved?.error && <p role="alert">{view.saved.error}</p>}
    {result && <>
      <p>{result.summary}</p>
      <div className={styles.dailyPlannerChoices}>
        {result.recommendation && choice(result.recommendation,"Recommended today")}
        {result.alternatives.map(item=>choice(item,"Alternative"))}
      </div>
      <p><strong>Uncertainty:</strong> {result.uncertainty}</p>
      {!!result.deferred.length && <details><summary>Better to defer</summary><ul>{result.deferred.map(item=><li key={item.storyId}><strong>{snapshot?.candidates.find(c=>c.storyId===item.storyId)?.title}</strong> — {item.reason}</li>)}</ul></details>}
      <small>Prepared {new Date(view!.saved!.startedAt).toLocaleString()} · {view?.saved?.provider ?? "Eligibility check"} {view?.saved?.model}</small>
    </>}
    {view && <details><summary>Current publishing context</summary>
      <p>Confirmed publications are deduplicated across platforms. Imported Instagram posts come from the currently connected account. This history indicates variety, not measured growth.</p>
      <ol>{view.context.recentPublications.map((p,i)=><li key={`${p.mediaId ?? p.storyId}-${i}`}>{p.title} · {p.platform} · {new Date(p.publishedAt).toLocaleDateString(undefined,{timeZone:view.context.timezone})}</li>)}</ol>
      <h3>Scheduled or in progress</h3>
      {view.context.commitments.length ? <ul>{view.context.commitments.map((p,i)=><li key={`${p.storyId}-${i}`}>{p.title} · {p.status}{p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleString(undefined,{timeZone:view.context.timezone})}` : ""}</li>)}</ul> : <p>No scheduled or in-flight posts recorded.</p>}
    </details>}
  </section>;
}
