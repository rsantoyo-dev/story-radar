"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { DailyEditorialPlannerPanel } from "./daily-editorial-planner-panel";
import { DAILY_PREPARATION_LABELS, DAILY_PREPARATION_STEPS, DAILY_PREPARATION_TITLES, DRAFT2_PREPARATION_STEPS, STORY_UNSELECTED_MESSAGE, preparationTarget, runApprovedStory, type DailyPreparationStep, type DailyPreparationRun, type DailyPreparationProgress } from "./modules/stories/daily-preparation.types";
import { Button } from "./ui/primitives";
import styles from "./radar-dashboard.generated.module.css";

/**
 * "Prepare my day": one run collects the editorial line's stories, evaluates
 * them, selects today's story (the planner), approves it and prepares its
 * content; from there the carousel is Draft 2's ("Open in Draft 2"). Back on
 * Today since 2026-10-19, through Content: the v1 steps it used to continue
 * into (focus, script, cover, images) left with the studio. The route
 * (`/api/radar/daily-preparation`) drives the run on the server; this panel
 * reads it (fast while running, slowly when idle) and starts, continues or
 * stops it.
 */
const clock = (iso?: string) => iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
/** What happened at a completed step, for the step's tooltip. */
function stepDetail(step: DailyPreparationStep, progress: DailyPreparationProgress): string | undefined {
  switch (step) {
    case "recommend": return progress.storyTitle && `Story: ${progress.storyTitle}`;
    case "approve": return progress.storyTitle && `Approved: ${progress.storyTitle}`;
    case "content": return progress.storyTitle && `Content ready: ${progress.storyTitle}`;
    default: return undefined;
  }
}
/** A step's place among Draft 2's five; a run saved with a v1 step past Content counts as all five done. */
function stepIndex(step: DailyPreparationStep | undefined): number {
  if (!step) return -1;
  const index = DRAFT2_PREPARATION_STEPS.indexOf(step);
  if (index >= 0) return index;
  return DAILY_PREPARATION_STEPS.indexOf(step) > DAILY_PREPARATION_STEPS.indexOf("content") ? DRAFT2_PREPARATION_STEPS.length - 1 : -1;
}
const subscribe=()=>()=>{};
const browserZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone=()=>"UTC";
type Props=ComponentProps<typeof DailyEditorialPlannerPanel> & {onCompleted:()=>void;
  /** Removes the story from production; resolves false when the editor cancels. */
  onUnselect?:(storyId:string)=>Promise<boolean>};
type State={run:DailyPreparationRun|null;lines:{id:string;name:string;timezone:string}[];
  /** Whether the run's story is still in production (null: no story, or unknown). */
  storySelected?:boolean|null};

export function DailyPreparationPanel({onCompleted,onUnselect,...props}:Props) {
  const {topicId,secret,disabled,onOpenDraft2}=props;
  const timezone=useSyncExternalStore(subscribe,browserZone,serverZone);
  const [data,setData]=useState<State>();
  const [lineId,setLineId]=useState("");
  const [targetSelection,setTargetSelection]=useState<DailyPreparationStep>();
  /** A story the editor picks instead of the planner's recommendation ("" = the recommendation). */
  const [storyChoice,setStoryChoice]=useState("");
  const [choices,setChoices]=useState<{storyId:string;title:string;editorialPriority:number;growthScore:number|null}[]>([]);
  useEffect(()=>{
    if(!secret.trim())return;
    const controller=new AbortController();
    fetch(`/api/radar/daily-planner?topicId=${encodeURIComponent(topicId)}&timezone=${encodeURIComponent(timezone)}`,{headers:{Authorization:`Bearer ${secret.trim()}`},cache:"no-store",signal:controller.signal})
      .then(response=>response.ok?response.json():undefined)
      .then((body:{context?:{candidates?:{storyId:string;title:string;editorialPriority:number;growthScore:number|null}[]}}|undefined)=>{
        if(!controller.signal.aborted)setChoices([...(body?.context?.candidates ?? [])].sort((a,b)=>b.editorialPriority-a.editorialPriority));
      })
      .catch(()=>{});
    return ()=>controller.abort();
  },[topicId,secret,timezone]);
  const [pending,setPending]=useState(false);
  const [newRun,setNewRun]=useState(false);
  /** The editor chose to keep working on a run from an earlier day. */
  const [resumeOld,setResumeOld]=useState(false);
  /** When the latest run state arrived; dates an older run without reading the clock during render. */
  const [loadedAt,setLoadedAt]=useState<number>();
  const [error,setError]=useState("");
  const completed=useRef("");
  const completionCallback=useRef(onCompleted);
  const posting=useRef(false);
  const generation=useRef(0);
  const dataRef=useRef<State|undefined>(undefined);
  const rescheduleRef=useRef<()=>void>(()=>{});
  // Shared by the poller and every POST handler below: keep dataRef in sync so the poller always sees the freshest status,
  // and re-arm its timer immediately (fast while running, slow once idle) instead of waiting out whatever delay was in flight.
  function apply(value:State){dataRef.current=value;setData(value);rescheduleRef.current();}
  useEffect(()=>{completionCallback.current=onCompleted;},[onCompleted]);
  useEffect(()=>{
    if(!secret.trim())return;
    let disposed=false;
    let controller:AbortController|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined;
    // The GET route only reads the database unless it finds a run stuck in "running" with an expired lease (see route.ts),
    // so polling has no provider cost; stay tight (4 s) while something is in flight, back off (60 s) otherwise.
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
        dataRef.current=value;setData(value);setError("");setLoadedAt(Date.now());
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
  const runTarget=run ? preparationTarget(run.progress) : undefined;
  // A run saved with a v1 target past Content continues to Content at most: the carousel is Draft 2's.
  const selectedTarget=targetSelection ?? (runTarget && DRAFT2_PREPARATION_STEPS.includes(runTarget) ? runTarget : runTarget ? "content" : "recommend");
  // A run from an earlier day picked from that day's stories, some since published: start fresh by default.
  const runIsOld=Boolean(run && run.status!=="running" && loadedAt && loadedAt-Date.parse(run.startedAt)>18*3_600_000);
  const fresh=newRun || !run || selectedLine!==run.lineId || (runIsOld && !resumeOld);
  async function post(body:Record<string,unknown>,failure:string,onDone?:()=>void){
    if(posting.current)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      apply(value);onDone?.();
    }catch(error){setError(error instanceof Error?error.message:failure);}
    finally{posting.current=false;setPending(false);}
  }
  const start=(targetStep:DailyPreparationStep)=>post(
    fresh?(storyChoice?{action:"start-story",storyId:storyChoice,lineId:selectedLine,timezone,targetStep}:{action:"start",lineId:selectedLine,timezone,targetStep}):{action:"continue",runId:run!.id,targetStep},
    "Unable to start preparation",()=>{setNewRun(false);setResumeOld(false);setStoryChoice("");});
  const stopRun=()=>run?post({action:"stop",runId:run.id},"Unable to stop the run"):undefined;
  const retryRun=()=>run?post({action:"retry",runId:run.id},"Unable to retry the step"):undefined;
  async function unselectStory(){
    const storyId=run?.progress.storyId;
    if(posting.current || !storyId || !onUnselect)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      if(!(await onUnselect(storyId)))return;
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{headers:{Authorization:`Bearer ${secret.trim()}`},cache:"no-store"});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      apply(value);
    }catch(error){setError(error instanceof Error?error.message:"Unable to refresh the run");}
    finally{posting.current=false;setPending(false);}
  }
  const steps=DRAFT2_PREPARATION_STEPS;
  const completedStep=run?.progress.completedStep ?? (run?.status==="completed" ? run.step as DailyPreparationStep : undefined);
  const completedIndex=fresh?-1:completedStep?stepIndex(completedStep):run?stepIndex(run.step as DailyPreparationStep)-1:-1;
  const running=run?.status==="running";
  const blocked=disabled || pending || running || !secret.trim();
  const storyReady=Boolean(run?.progress.storyId && !running && runApprovedStory(run.progress));
  return <section className={styles.dailyPlanner} aria-label="Prepare my day">
    <div className={styles.dailyPlannerHeader}>
      <div><span className={styles.eyebrow}>Daily editorial workflow</span><h2>Prepare my day</h2><p>Choose an editorial line and how far to prepare: the run collects its stories, evaluates them, selects today’s story, approves it and prepares its content. Completed steps are reused when you continue; the carousel is written in Draft 2.</p><small>Time zone: {timezone}. Search uses the editorial line’s time period and sources.</small></div>
      <div className={styles.dailyPlannerControls}>
        <label>Editorial line<select value={selectedLine} disabled={blocked} onChange={event=>setLineId(event.target.value)}>{!data?.lines.length && <option value="">Loading lines…</option>}{data?.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
        {fresh && choices.length ? <label>Story<select value={storyChoice} disabled={blocked} onChange={event=>setStoryChoice(event.target.value)}>
          <option value="">Today’s recommendation (the planner chooses)</option>
          <optgroup label="Today’s candidates">
            {choices.map(choice=><option key={choice.storyId} value={choice.storyId}>{choice.title.length>90?`${choice.title.slice(0,90)}…`:choice.title} · editorial {Math.round(choice.editorialPriority)}{choice.growthScore!==null?` · growth ${Math.round(choice.growthScore)}`:""}</option>)}
          </optgroup>
        </select></label> : null}
        <label>Prepare through<select value={selectedTarget} disabled={blocked} onChange={event=>setTargetSelection(event.target.value as DailyPreparationStep)}>{steps.map(step=><option key={step} value={step}>{DAILY_PREPARATION_TITLES[step]}</option>)}</select></label>
        <Button variant="primary" disabled={blocked || !selectedLine} onClick={()=>void start(selectedTarget)}>{pending?"Starting…":fresh?(storyChoice?"Prepare this story":run?"Start a new run":"Prepare through this step"):"Continue this run"}</Button>
        {running && <Button disabled={disabled || pending || !secret.trim()} onClick={()=>void stopRun()}>{pending?"Stopping…":"Stop this run"}</Button>}
        {run && !running && (runIsOld && !resumeOld && !newRun
          ? <Button disabled={blocked} onClick={()=>setResumeOld(true)}>Continue the {new Date(run.startedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})} run</Button>
          : <Button disabled={blocked} onClick={()=>{if(newRun){setNewRun(false);setResumeOld(true);}else setNewRun(true);}}>{newRun?"Return to current run":"Start a new run instead"}</Button>)}
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {fresh && runIsOld && !resumeOld && !newRun && run ? <p role="status">The last run is from {new Date(run.startedAt).toLocaleDateString(undefined,{month:"long",day:"numeric"})}. A new run selects from today’s stories, so it will not repeat a story published since.</p> : null}
    {fresh && <p role="status">Select how far to prepare, then choose “{run ? "Start a new run" : "Prepare through this step"}.”</p>}
    <ol className={styles.dailyPreparationSteps}>{steps.map((step,index)=>{
      const done=index<=completedIndex;
      const active=!fresh && run?.step===step && !done;
      const canOpen=done && step==="content" && Boolean(run?.progress.storyId);
      // Drives the color coding in radar-dashboard.module.uxdsl — keep in sync with the [data-step-status="..."] rules there.
      const stepStatus=done?(canOpen?"done-open":"done"):active?(running?"running":"attention"):"todo";
      const detail=done && run ? stepDetail(step, run.progress) : undefined;
      const statusDetail=(done?(canOpen?"Completed · Open":"Completed"):active?(running?"In progress": "Needs review"):"Pending")+(detail?` · ${detail}`:"");
      return <li key={step} aria-current={active && running?"step":undefined}>
        <button type="button" className={styles.dailyPreparationStepButton} data-step-status={stepStatus} disabled={blocked || !selectedLine || !canOpen} onClick={()=>{ if(canOpen && run?.progress.storyId) props.onViewContent(run.progress.storyId); }} title={statusDetail} aria-label={`${DAILY_PREPARATION_TITLES[step]} · ${statusDetail}`}>
          <span aria-hidden="true">{done?"✓":index+1}</span>
          {DAILY_PREPARATION_TITLES[step]}
        </button>
      </li>;
    })}</ol>
    {run && !fresh && <>
      <p className={styles.dailyPreparationStatusLine} data-run-status={run.status} role="status" aria-live="polite">{running?`${DAILY_PREPARATION_LABELS[run.step]} · Step ${stepIndex(run.step as DailyPreparationStep)+1} of ${stepIndex(selectedTarget)+1}`:run.status==="completed"?`${DAILY_PREPARATION_TITLES[completedStep ?? "content"]} ready`:(run.status==="needs-review"?"Needs your review":`Stopped: ${DAILY_PREPARATION_LABELS[run.step]}`)} · {run.progress.lineName}</p>
      <p>{run.progress.collected ?? 0} stories collected · {run.progress.evaluated} evaluated{run.progress.recommendationRunId?" · Recommendation ready":""} · Started {new Date(run.startedAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
      {(run.progress.activity?.length || run.progress.storyTitle) ? <div className={styles.runStory}>
        <section aria-label="What happened">
          <h3>What happened</h3>
          <ol className={styles.runTimeline}>
            {(run.progress.activity ?? []).map((entry,index)=><li key={`${entry.at}:${index}`} data-kind={entry.kind ?? "info"}><time dateTime={entry.at}>{clock(entry.at)}</time><span>{entry.text}</span></li>)}
            {running ? <li data-kind="now"><time>now</time><span>{DAILY_PREPARATION_LABELS[run.step]}</span></li> : null}
          </ol>
        </section>
        {run.progress.storyTitle ? <section aria-label="The story" className={styles.runCard}>
          <h3>The story</h3>
          <strong>{run.progress.storyTitle}</strong>
          {run.progress.selection?.reason ? <p>Why: {run.progress.selection.reason}</p> : null}
          {run.progress.selection?.alternatives.length ? <p><small>Also considered: {run.progress.selection.alternatives.join(" · ")}</small></p> : null}
        </section> : null}
      </div> : null}
      {run.progress.collectionWarning && <p role="status">{run.progress.collectionWarning}</p>}
      {run.progress.evaluationWarning && <p role="status">{run.progress.evaluationWarning}</p>}
      {run.progress.skippedStories?.length ? <div role="status"><p>Skipped {run.progress.skippedStories.length === 1 ? "1 story" : `${run.progress.skippedStories.length} stories`} and moved to the next one:</p><ul>{run.progress.skippedStories.map(story=><li key={story.storyId}>{story.title || "Untitled story"}: {story.reason}</li>)}</ul></div> : null}
      {run.error && <p role="alert">{run.error}</p>}
      {runApprovedStory(run.progress) && data?.storySelected===false && run.error!==STORY_UNSELECTED_MESSAGE
        ? <p role="status">This story was removed from production. Continuing this run will not select it again: start a new run to choose another story, or approve this one again in Discover.</p> : null}
      {(run.progress.storyId || (run.status==="needs-review" || run.status==="failed")) && !running && <div className={styles.dailyPlannerActions}>
        {run.progress.storyId ? <Button disabled={disabled} onClick={()=>props.onViewContent(run.progress.storyId!)}>Review content</Button> : null}
        {storyReady && data?.storySelected!==false ? <Button variant="primary" disabled={disabled} onClick={()=>onOpenDraft2(run.progress.storyId!)}>Open in Draft 2</Button> : null}
        {(run.status==="needs-review" || run.status==="failed") ? <Button disabled={disabled || pending} onClick={()=>void retryRun()}>Retry this step</Button> : null}
        {onUnselect && data?.storySelected===true && <Button variant="quiet" disabled={disabled || pending} onClick={()=>void unselectStory()}>Unselect story</Button>}
      </div>}
    </>}
  </section>;
}
