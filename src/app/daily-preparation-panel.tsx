"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { DailyEditorialPlannerPanel } from "./daily-editorial-planner-panel";
import { DAILY_PREPARATION_LABELS, type DailyPreparationRun } from "./modules/stories/daily-preparation.types";
import styles from "./radar-dashboard.generated.module.css";
const subscribe=()=>()=>{};
const browserZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone=()=>"UTC";
type Props=ComponentProps<typeof DailyEditorialPlannerPanel> & {onCompleted:()=>void;onOpenDraft:(storyId:string,title:string,draftId?:string)=>void};
type State={run:DailyPreparationRun|null;lines:{id:string;name:string;timezone:string}[]};
export function DailyPreparationPanel({onCompleted,onOpenDraft,...props}:Props) {
  const {topicId,secret,disabled}=props;
  const timezone=useSyncExternalStore(subscribe,browserZone,serverZone);
  const [data,setData]=useState<State>();
  const [lineId,setLineId]=useState("");
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const completed=useRef("");
  const completionCallback=useRef(onCompleted);
  const posting=useRef(false);
  const generation=useRef(0);
  useEffect(()=>{completionCallback.current=onCompleted;},[onCompleted]);
  useEffect(()=>{
    if(!secret.trim())return;
    let disposed=false;
    let controller:AbortController|undefined;
    async function read(){
      if(posting.current)return;
      const requestGeneration=generation.current;
      controller?.abort();controller=new AbortController();
      try {
        const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{headers:{Authorization:`Bearer ${secret.trim()}`},signal:controller.signal,cache:"no-store"});
        const value=await response.json();if(!response.ok)throw new Error(value.error);
        if(disposed || posting.current || requestGeneration!==generation.current)return;
        setData(value);setError("");
        if(value.run?.status==="completed" && completed.current!==value.run.id){completed.current=value.run.id;completionCallback.current();}
      }catch(error){if(!disposed && !controller.signal.aborted)setError(error instanceof Error?error.message:"Unable to load preparation");}
    }
    void read();
    const interval=setInterval(()=>void read(),4000);
    return()=>{disposed=true;controller?.abort();clearInterval(interval);};
  },[topicId,secret]);
  const run=data?.run;
  const selectedLine=lineId || data?.lines[0]?.id || "";
  async function start(retry=false,mode:"day"|"draft"="day"){
    if(posting.current)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify(retry?{action:"retry",runId:run?.id}:{action:"start",lineId:selectedLine,timezone,mode})});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      setData(value);
    }catch(error){setError(error instanceof Error?error.message:"Unable to start preparation");}
    finally{posting.current=false;setPending(false);}
  }
  const steps=run?.progress.mode==="draft"?["collect","evaluate","recommend","content","brief","draft"]:["collect","evaluate","recommend"];
  const running=run?.status==="running";
  const blocked=disabled || pending || running || !secret.trim();
  return <section className={styles.dailyPlanner} aria-label="Prepare my day">
    <div className={styles.dailyPlannerHeader}>
      <div><span className={styles.eyebrow}>Daily editorial workflow</span><h2>Prepare my day</h2><p>Collect stories, evaluate with AI and recommend what to publish today.</p><small>Today uses {timezone}. Collection uses the editorial line’s period and sources.</small></div>
      <div className={styles.dailyPlannerControls}>
        <label>Editorial line<select value={selectedLine} disabled={blocked} onChange={event=>setLineId(event.target.value)}>{!data?.lines.length && <option value="">Loading editorial lines…</option>}{data?.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
        <button type="button" className={styles.primaryButton} disabled={blocked || !selectedLine} onClick={()=>void start()}>{pending?"Starting…":running?DAILY_PREPARATION_LABELS[run.step]:"Prepare my day"}</button>
        <button type="button" className={styles.secondaryButton} disabled={blocked || !selectedLine} onClick={()=>void start(false,"draft")}>Prepare my draft</button>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {run && <>
      <p role="status" aria-live="polite">{running?DAILY_PREPARATION_LABELS[run.step]:run.status==="completed"?(run.progress.mode==="draft"?"Your draft is ready":"Your daily selection is ready"):(run.status==="needs-review"?"Needs your review":`Stopped: ${DAILY_PREPARATION_LABELS[run.step]}`)} · {run.progress.lineName}</p>
      <ol className={styles.dailyPreparationSteps}>{steps.map((step,index)=>{
        const active=steps.indexOf(run.step);
        const done=run.status==="completed" || index<active;
        return <li key={step} aria-current={running && run.step===step?"step":undefined}><strong>{done?"✓ ":`${index+1}. `}{({collect:"Collect stories",evaluate:"Evaluate with AI",recommend:"Recommend for today",content:"Prepare and check content",brief:"Create creative brief",draft:"Generate draft"})[step]}</strong><span>{done?"Completed":run.step===step?(running?"In progress":"Needs attention"):"Waiting"}</span></li>;
      })}</ol>
      <p>{run.progress.collected ?? 0} stories collected · {run.progress.evaluated} evaluated{run.progress.recommendationRunId?" · Recommendation ready":""}</p>
      {run.progress.collectionWarning && <p role="status">{run.progress.collectionWarning}</p>}
      {run.progress.evaluationWarning && <p role="status">{run.progress.evaluationWarning}</p>}
      {run.error && <p role="alert">{run.error}</p>}
      {(run.status==="failed" || run.status==="needs-review") && <button type="button" className={styles.secondaryButton} disabled={disabled || pending} onClick={()=>void start(true)}>Retry this step</button>}
      {run.progress.storyId && run.status!=="running" && <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={()=>props.onViewContent(run.progress.storyId!)}>Review content</button>
        {(run.progress.briefId || run.progress.draftId) && <button type="button" className={styles.primaryButton} disabled={disabled} onClick={()=>onOpenDraft(run.progress.storyId!,run.progress.storyTitle ?? "Creative draft",run.progress.draftId)}>{run.progress.draftId?"Open draft":"Open creative brief"}</button>}
      </div>}
      {run.status==="completed" && <DailyEditorialPlannerPanel {...props} refreshKey={run.updatedAt} />}
    </>}
  </section>;
}
