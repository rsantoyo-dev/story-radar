"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { DailyEditorialPlannerPanel } from "./daily-editorial-planner-panel";
import { BRIEF_EVIDENCE_REVIEW_MESSAGE, DAILY_PREPARATION_LABELS, DAILY_PREPARATION_STEPS, DAILY_PREPARATION_TITLES, preparationTarget, type DailyPreparationStep, type DailyPreparationRun } from "./modules/stories/daily-preparation.types";
import styles from "./radar-dashboard.generated.module.css";
const subscribe=()=>()=>{};
const browserZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone=()=>"UTC";
type Props=ComponentProps<typeof DailyEditorialPlannerPanel> & {onCompleted:()=>void;onOpenDraft:(storyId:string,title:string,draftId?:string,preparationRunId?:string)=>void};
type State={run:DailyPreparationRun|null;lines:{id:string;name:string;timezone:string}[]};
export function DailyPreparationPanel({onCompleted,onOpenDraft,...props}:Props) {
  const {topicId,secret,disabled}=props;
  const timezone=useSyncExternalStore(subscribe,browserZone,serverZone);
  const [data,setData]=useState<State>();
  const [lineId,setLineId]=useState("");
  const [pending,setPending]=useState(false);
  const [newRun,setNewRun]=useState(false);
  const [error,setError]=useState("");
  const completed=useRef("");
  const completionCallback=useRef(onCompleted);
  const posting=useRef(false);
  const generation=useRef(0);
  const dataRef=useRef<State|undefined>(undefined);
  const rescheduleRef=useRef<()=>void>(()=>{});
  // Shared by the poller and every POST handler below: keep dataRef in sync
  // so the poller always sees the freshest status, and re-arm its timer
  // immediately (fast while running, slow once idle) instead of waiting out
  // whatever delay was already in flight.
  function apply(value:State){dataRef.current=value;setData(value);rescheduleRef.current();}
  useEffect(()=>{completionCallback.current=onCompleted;},[onCompleted]);
  useEffect(()=>{
    if(!secret.trim())return;
    let disposed=false;
    let controller:AbortController|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined;
    // The GET route only reads the database unless it finds a run stuck in
    // "running" with an expired lease (see route.ts) — so polling has no
    // provider cost either way, but there's no reason to hammer it once a
    // run is idle/terminal. Stay tight (4s) while something is actually in
    // flight, back off (60s) otherwise.
    function delay(){return posting.current || dataRef.current?.run?.status==="running"?4000:60000;}
    function schedule(){if(timer)clearTimeout(timer);if(!disposed)timer=setTimeout(()=>void read(),delay());}
    rescheduleRef.current=schedule;
    async function read(){
      if(posting.current){schedule();return;}
      const requestGeneration=generation.current;
      controller?.abort();controller=new AbortController();
      try {
        const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{headers:{Authorization:`Bearer ${secret.trim()}`},signal:controller.signal,cache:"no-store"});
        const value=await response.json();if(!response.ok)throw new Error(value.error);
        if(disposed || posting.current || requestGeneration!==generation.current)return;
        dataRef.current=value;setData(value);setError("");
        const completionKey=value.run ? `${value.run.id}:${value.run.updatedAt}` : "";
        if(value.run?.status==="completed" && completed.current!==completionKey){completed.current=completionKey;completionCallback.current();}
      }catch(error){if(!disposed && !controller.signal.aborted)setError(error instanceof Error?error.message:"Unable to load preparation");}
      finally{if(!disposed)schedule();}
    }
    void read();
    return()=>{disposed=true;controller?.abort();if(timer)clearTimeout(timer);rescheduleRef.current=()=>{};};
  },[topicId,secret]);
  const run=data?.run;
  const selectedLine=lineId || run?.lineId || data?.lines[0]?.id || "";
  const fresh=newRun || !run || selectedLine!==run.lineId;
  async function start(targetStep:DailyPreparationStep){
    if(posting.current)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify(fresh?{action:"start",lineId:selectedLine,timezone,targetStep}:{action:"continue",runId:run.id,targetStep})});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      apply(value);setNewRun(false);
    }catch(error){setError(error instanceof Error?error.message:"Unable to start preparation");}
    finally{posting.current=false;setPending(false);}
  }
  async function acknowledgeBrief(){
    if(posting.current || !run)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify({action:"acknowledge-brief",runId:run.id})});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      apply(value);
    }catch(error){setError(error instanceof Error?error.message:"Unable to accept the brief");}
    finally{posting.current=false;setPending(false);}
  }
  const steps=DAILY_PREPARATION_STEPS;
  const completedStep=run?.progress.completedStep ?? (run?.status==="completed" ? run.step as DailyPreparationStep : undefined);
  const completedIndex=fresh?-1:completedStep?steps.indexOf(completedStep):run?steps.indexOf(run.step as DailyPreparationStep)-1:-1;
  const running=run?.status==="running";
  const blocked=disabled || pending || running || !secret.trim();
  return <section className={styles.dailyPlanner} aria-label="Prepare my day">
    <div className={styles.dailyPlannerHeader}>
      <div><span className={styles.eyebrow}>Daily editorial workflow</span><h2>Prepare my day</h2><p>Choose how far to go. Recommend automatically approves the best story for today. Completed steps are reused when you continue.</p><small>Today uses {timezone}. Collection uses the editorial line’s period and sources.</small></div>
      <div className={styles.dailyPlannerControls}>
        <label>Editorial line<select value={selectedLine} disabled={blocked} onChange={event=>setLineId(event.target.value)}>{!data?.lines.length && <option value="">Loading editorial lines…</option>}{data?.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
        {run && <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={()=>setNewRun(value=>!value)}>{newRun?"Return to current run":"New run"}</button>}
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {fresh && <p role="status">Choose a step to start a new run.</p>}
    <ol className={styles.dailyPreparationSteps}>{steps.map((step,index)=>{
      const done=index<=completedIndex;
      const active=!fresh && run?.step===step && !done;
      const opensDraft=step==="brief" || step==="draft" || step==="approve-draft" || step==="images";
      const canOpen=done && ((step==="content" && run?.progress.storyId) || (opensDraft && run?.progress.briefId));
      // Drives the color coding in radar-dashboard.module.uxdsl — keep in
      // sync with the [data-step-status="..."] rules there.
      const stepStatus=done?(canOpen?"done-open":"done"):active?(running?"running":"attention"):"todo";
      const statusDetail=done?(canOpen?"Completed · Open":"Completed"):active?(running?"Running": "Needs attention · Retry"):"Run to here";
      return <li key={step} aria-current={active && running?"step":undefined}>
        <button type="button" className={styles.dailyPreparationStepButton} data-step-status={stepStatus} disabled={blocked || !selectedLine || (done && !canOpen)} onClick={()=>{
          if(done && run?.progress.storyId) {
            if(step==="content")props.onViewContent(run.progress.storyId);
            else onOpenDraft(run.progress.storyId,run.progress.storyTitle ?? "Creative draft",step==="draft"||step==="approve-draft"||step==="images"?run.progress.draftId:undefined,run.id);
          } else void start(step);
        }} title={statusDetail} aria-label={`${DAILY_PREPARATION_TITLES[step]} · ${statusDetail}`}>
          <span aria-hidden="true">{done?"✓":index+1}</span>
          {DAILY_PREPARATION_TITLES[step]}
        </button>
      </li>;
    })}</ol>
    {run && <>
      <p className={styles.dailyPreparationStatusLine} data-run-status={run.status} role="status" aria-live="polite">{running?`${DAILY_PREPARATION_LABELS[run.step]} · Step ${steps.indexOf(run.step as DailyPreparationStep)+1} of ${steps.indexOf(preparationTarget(run.progress))+1}`:run.status==="completed"?`${DAILY_PREPARATION_TITLES[completedStep!]} ready`:(run.status==="needs-review"?"Needs your review":`Stopped: ${DAILY_PREPARATION_LABELS[run.step]}`)} · {run.progress.lineName}</p>
      <p>{run.progress.collected ?? 0} stories collected · {run.progress.evaluated} evaluated{run.progress.recommendationRunId?" · Recommendation ready":""}</p>
      {run.progress.collectionWarning && <p role="status">{run.progress.collectionWarning}</p>}
      {run.progress.evaluationWarning && <p role="status">{run.progress.evaluationWarning}</p>}
      {run.error && <p role="alert">{run.error}</p>}
      {run.progress.storyId && run.status!=="running" && <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={()=>props.onViewContent(run.progress.storyId!)}>Review content</button>
        {(run.progress.briefId || run.progress.draftId) && <button type="button" className={styles.primaryButton} disabled={disabled} onClick={()=>onOpenDraft(run.progress.storyId!,run.progress.storyTitle ?? "Creative draft",run.progress.draftId,run.id)}>{run.progress.draftId?"Open draft":"Open creative brief"}</button>}
        {run.status==="needs-review" && run.step==="brief" && run.error===BRIEF_EVIDENCE_REVIEW_MESSAGE && run.progress.briefId && <button type="button" className={styles.secondaryButton} disabled={disabled || pending} onClick={()=>void acknowledgeBrief()}>Accept brief and continue</button>}
      </div>}
      {run.status==="needs-review" && run.step==="brief" && run.error===BRIEF_EVIDENCE_REVIEW_MESSAGE && <p role="status">Retrying regenerates the same brief from the same source and will keep saying this when the gap is inherent to the source (for example, a small local sample) rather than a fluke. Open the brief above to judge it yourself, then use “Accept brief and continue” instead of retrying.</p>}
      {run.progress.recommendationRunId && !running && <DailyEditorialPlannerPanel {...props} refreshKey={run.updatedAt} />}
    </>}
  </section>;
}
