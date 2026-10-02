"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { DailyEditorialPlannerPanel } from "./daily-editorial-planner-panel";
import { BRIEF_EVIDENCE_REVIEW_MESSAGE, preparationCallLabel, preparationModelLabel, type PreparationTextCall, DAILY_PREPARATION_LABELS, DAILY_PREPARATION_STEPS, DAILY_PREPARATION_TITLES, preparationTarget, type DailyPreparationStep, type DailyPreparationRun, type DailyPreparationProgress } from "./modules/stories/daily-preparation.types";
import Image from "next/image";
import { RunPublishActions } from "./run-publish-actions";
import styles from "./radar-dashboard.generated.module.css";

type RunImage = { id: string; unitOrder: number; status: string; imageUrl?: string | null; safetyFlag?: boolean };
const PENDING_IMAGE = new Set(["queued", "generating"]);

/**
 * The run's images as they generate (polling only while some are pending),
 * each with the same approve checkmark as the draft's thumbnails; once the
 * script and every image are approved, the publish actions appear below.
 */
function RunImages({ topicId, draftId, secret, draftApproved, disabled, fallback }: { topicId: string; draftId: string; secret: string; draftApproved: boolean; disabled?: boolean; fallback?: ReactNode }) {
  const [images, setImages] = useState<RunImage[]>();
  const [batchId, setBatchId] = useState<string>();
  const [busyAsset, setBusyAsset] = useState<string>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const response = await fetch(`/api/radar/creative/drafts/${encodeURIComponent(draftId)}/assets?topicId=${encodeURIComponent(topicId)}`, { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store" });
        const body = await response.json() as { batch?: { id: string; assets?: RunImage[] } };
        if (disposed || !response.ok) return;
        const assets = [...(body.batch?.assets ?? [])].sort((a, b) => a.unitOrder - b.unitOrder);
        setImages(assets);
        setBatchId(body.batch?.id);
        if (assets.some((asset) => PENDING_IMAGE.has(asset.status))) timer = setTimeout(() => void read(), 5000);
      } catch { /* the draft workspace shows the full state */ }
    }
    void read();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [topicId, draftId, secret, refresh]);
  async function approval(image: RunImage, action: "approve" | "unapprove") {
    setBusyAsset(image.id); setError("");
    try {
      const response = await fetch(`/api/radar/creative/assets/${encodeURIComponent(image.id)}?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${secret.trim()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The image approval could not be changed");
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(`Image ${image.unitOrder}: ${err instanceof Error ? err.message : "the approval could not be changed"}`);
    } finally { setBusyAsset(undefined); }
  }
  if (!images?.length) return <>{fallback}</>;
  const done = images.filter((image) => !PENDING_IMAGE.has(image.status)).length;
  const approved = images.filter((image) => image.status === "approved").length;
  const allApproved = draftApproved && approved === images.length;
  return <div className={styles.runImages}>
    <small>{done < images.length ? `Generating images · ${done} of ${images.length} ready` : `${images.length} images · ${approved} approved${draftApproved ? "" : " · approve the script first"}`}</small>
    <ol>{images.map((image) => <li key={image.id} data-status={image.status}>
      {image.imageUrl && !PENDING_IMAGE.has(image.status)
        ? <Image unoptimized src={image.imageUrl} width={432} height={540} alt={`Image ${image.unitOrder}`} />
        : <span aria-label={`Image ${image.unitOrder} ${image.status}`}>{image.unitOrder}</span>}
      {(image.status === "generated" || image.status === "approved") && draftApproved ? <button type="button" className={styles.runImageApproval} data-approved={image.status === "approved"}
        disabled={disabled || Boolean(busyAsset) || (image.status === "generated" && image.safetyFlag)}
        title={image.safetyFlag ? "Flagged by the safety checker: regenerate it in the draft" : image.status === "approved" ? `Remove approval from image ${image.unitOrder}` : `Approve image ${image.unitOrder}`}
        aria-label={image.status === "approved" ? `Remove approval from image ${image.unitOrder}` : `Approve image ${image.unitOrder}`}
        onClick={() => void approval(image, image.status === "approved" ? "unapprove" : "approve")}>{busyAsset === image.id ? "…" : "✓"}</button> : null}
    </li>)}</ol>
    {error ? <p role="alert">{error}</p> : null}
    {allApproved && batchId ? <RunPublishActions topicId={topicId} draftId={draftId} batchId={batchId} secret={secret} disabled={disabled} /> : null}
  </div>;
}

const credits = (micros: number) => (micros / 10_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function duration(call: PreparationTextCall): string {
  if (call.status === "reserved") return "running…";
  if (call.status === "uncertain") return "outcome uncertain";
  if (call.status === "failed") return "failed";
  if (!call.finishedAt) return "";
  const seconds = Math.max(0, Math.round((Date.parse(call.finishedAt) - Date.parse(call.startedAt)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** The AI calls behind the run's story, numbered under the step that made them (6.1, 7.1, 7.2…). */
function RunCalls({ calls }: { calls: PreparationTextCall[] }) {
  if (!calls.length) return null;
  const counters: Record<number, number> = {};
  const total = calls.reduce((sum, call) => sum + (call.creditMicros ?? 0), 0);
  return <section aria-label="AI calls">
    <h3>AI calls · {credits(total)} credits</h3>
    <ol className={styles.runCalls}>{calls.map((call, index) => {
      const step = DAILY_PREPARATION_STEPS.indexOf(call.operation === "editorial_focus" ? "focus" : "brief") + 1;
      counters[step] = (counters[step] ?? 0) + 1;
      return <li key={call.id} data-status={call.status}>
        <span>{step}.{counters[step]}</span>
        <span>{preparationCallLabel(call, calls.slice(0, index))}<small>{preparationModelLabel(call.model)} · {duration(call)}{call.creditMicros !== null ? ` · ${credits(call.creditMicros)} credits` : ""}</small></span>
      </li>;
    })}</ol>
  </section>;
}

const clock = (iso?: string) => iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
/** What actually happened at a completed step — shown on hover so a glance
 * answers "which story", "what focus", "is the carousel ready" without
 * opening anything. Undefined when the run predates a field (e.g. an older
 * completed step whose progress never recorded it). */
function stepDetail(step: DailyPreparationStep, progress: DailyPreparationProgress): string | undefined {
  switch (step) {
    case "recommend": return progress.storyTitle && `Story: ${progress.storyTitle}`;
    case "approve": return progress.storyTitle && `Approved: ${progress.storyTitle}`;
    case "content": return progress.storyTitle && `Content ready: ${progress.storyTitle}`;
    case "focus": return progress.editorialDirection && `Focus: ${progress.editorialDirection.length > 80 ? `${progress.editorialDirection.slice(0, 80)}…` : progress.editorialDirection}`;
    case "brief": return progress.draftId ? "Carousel script ready" : progress.briefId ? "Brief ready" : undefined;
    case "approve-draft": return progress.draftId && "Script approved";
    case "images": return progress.assetBatchId && "Image batch generated";
    default: return undefined;
  }
}
const subscribe=()=>()=>{};
const browserZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone=()=>"UTC";
type Props=ComponentProps<typeof DailyEditorialPlannerPanel> & {onCompleted:()=>void;onOpenDraft:(storyId:string,title:string,draftId?:string,preparationRunId?:string)=>void};
type RunSlides={version:number;status:string;units:{order:number;role:string;headline:string;subheadline:string|null}[]};
type State={run:DailyPreparationRun|null;lines:{id:string;name:string;timezone:string}[];calls?:PreparationTextCall[];slides?:RunSlides|null};

/** The script as slides before any image exists: number, role and headline on a 4:5 card. */
function RunSlidesPreview({ slides }: { slides: RunSlides }) {
  return <div className={styles.runImages}>
    <small>Script v{slides.version} · {slides.units.length} slides · {slides.status === "approved" ? "approved" : "waiting for approval"}</small>
    <ol className={styles.runSlides}>{slides.units.map((unit) => <li key={unit.order} title={unit.subheadline ? `${unit.headline} — ${unit.subheadline}` : unit.headline}>
      <span>{unit.order}</span>
      <strong>{unit.headline}</strong>
    </li>)}</ol>
  </div>;
}
export function DailyPreparationPanel({onCompleted,onOpenDraft,...props}:Props) {
  const {topicId,secret,disabled}=props;
  const timezone=useSyncExternalStore(subscribe,browserZone,serverZone);
  const [data,setData]=useState<State>();
  const [lineId,setLineId]=useState("");
  const [targetSelection,setTargetSelection]=useState<DailyPreparationStep>();
  const [autoApproveSelection,setAutoApproveSelection]=useState<boolean>();
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
  const selectedTarget=targetSelection ?? (run ? preparationTarget(run.progress) : "recommend");
  // A run from an earlier day picked from that day's stories, some since published: start fresh by default.
  const runIsOld=Boolean(run && run.status!=="running" && loadedAt && loadedAt-Date.parse(run.startedAt)>18*3_600_000);
  const fresh=newRun || !run || selectedLine!==run.lineId || (runIsOld && !resumeOld);
  const autoApprove=autoApproveSelection ?? (fresh ? false : run?.progress.autoApprove === true);
  async function start(targetStep:DailyPreparationStep){
    if(posting.current)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify(fresh?{action:"start",lineId:selectedLine,timezone,targetStep,autoApprove}:{action:"continue",runId:run.id,targetStep,autoApprove})});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      apply(value);setNewRun(false);setResumeOld(false);
    }catch(error){setError(error instanceof Error?error.message:"Unable to start preparation");}
    finally{posting.current=false;setPending(false);}
  }
  async function stopRun(){
    if(posting.current || !run)return;
    ++generation.current;posting.current=true;setPending(true);setError("");
    try {
      const response=await fetch(`/api/radar/daily-preparation?topicId=${encodeURIComponent(topicId)}`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify({action:"stop",runId:run.id})});
      const value=await response.json();if(!response.ok)throw new Error(value.error);
      apply(value);
    }catch(error){setError(error instanceof Error?error.message:"Unable to stop the run");}
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
      <div><span className={styles.eyebrow}>Daily editorial workflow</span><h2>Prepare my day</h2><p>Choose an editorial line and how far to prepare. Completed steps are reused when you continue. Before generating images, approve the exact script in the studio, or let the system approve it when its automated review passes.</p><small>Time zone: {timezone}. Search uses the editorial line’s time period and sources.</small></div>
      <div className={styles.dailyPlannerControls}>
        <label>Editorial line<select value={selectedLine} disabled={blocked} onChange={event=>setLineId(event.target.value)}>{!data?.lines.length && <option value="">Loading lines…</option>}{data?.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
        <label>Prepare through<select value={selectedTarget} disabled={blocked} onChange={event=>setTargetSelection(event.target.value as DailyPreparationStep)}>{steps.map(step=><option key={step} value={step}>{DAILY_PREPARATION_TITLES[step]}</option>)}</select></label>
        <button type="button" className={styles.primaryButton} disabled={blocked || !selectedLine} onClick={()=>void start(selectedTarget)}>{pending?"Starting…":fresh?(run?"Start a new run":"Prepare through this step"):"Continue this run"}</button>
        {running && <button type="button" className={styles.secondaryButton} disabled={disabled || pending || !secret.trim()} onClick={()=>void stopRun()}>{pending?"Stopping…":"Stop this run"}</button>}
        {run && !running && (runIsOld && !resumeOld && !newRun
          ? <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={()=>setResumeOld(true)}>Continue the {new Date(run.startedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})} run</button>
          : <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={()=>{if(newRun){setNewRun(false);setResumeOld(true);}else setNewRun(true);}}>{newRun?"Return to current run":"Start a new run instead"}</button>)}
        <label className={styles.dailyPreparationAutoApprove}><input type="checkbox" id="daily-preparation-auto-approve" checked={autoApprove} disabled={blocked} onChange={event=>setAutoApproveSelection(event.target.checked)} />Approve the script and images automatically when their checks pass. Publishing stays manual.</label>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {fresh && runIsOld && !resumeOld && !newRun && run ? <p role="status">The last run is from {new Date(run.startedAt).toLocaleDateString(undefined,{month:"long",day:"numeric"})}. A new run selects from today’s stories, so it will not repeat a story published since.</p> : null}
    {fresh && <p role="status">Select how far to prepare, then choose “{run ? "Start a new run" : "Prepare through this step"}.”</p>}
    <ol className={styles.dailyPreparationSteps}>{steps.map((step,index)=>{
      const done=index<=completedIndex;
      const active=!fresh && run?.step===step && !done;
      const opensDraft=step==="brief" || step==="approve-draft" || step==="images";
      const canOpen=done && ((step==="content" && run?.progress.storyId) || (opensDraft && run?.progress.briefId));
      // Drives the color coding in radar-dashboard.module.uxdsl — keep in
      // sync with the [data-step-status="..."] rules there.
      const stepStatus=done?(canOpen?"done-open":"done"):active?(running?"running":"attention"):"todo";
      const detail=done && run ? stepDetail(step, run.progress) : undefined;
      const statusDetail=(done?(canOpen?"Completed · Open":"Completed"):active?(running?"In progress": "Needs review"):"Pending")+(detail?` · ${detail}`:"");
      return <li key={step} aria-current={active && running?"step":undefined}>
        <button type="button" className={styles.dailyPreparationStepButton} data-step-status={stepStatus} disabled={blocked || !selectedLine || !canOpen} onClick={()=>{
          if(done && run?.progress.storyId) {
            if(step==="content")props.onViewContent(run.progress.storyId);
            else onOpenDraft(run.progress.storyId,run.progress.storyTitle ?? "Creative draft",opensDraft?run.progress.draftId:undefined,run.id);
          }
        }} title={statusDetail} aria-label={`${DAILY_PREPARATION_TITLES[step]} · ${statusDetail}`}>
          <span aria-hidden="true">{done?"✓":index+1}</span>
          {DAILY_PREPARATION_TITLES[step]}
        </button>
      </li>;
    })}</ol>
    {run && <>
      <p className={styles.dailyPreparationStatusLine} data-run-status={run.status} role="status" aria-live="polite">{running?`${DAILY_PREPARATION_LABELS[run.step]} · Step ${steps.indexOf(run.step as DailyPreparationStep)+1} of ${steps.indexOf(preparationTarget(run.progress))+1}`:run.status==="completed"?`${DAILY_PREPARATION_TITLES[completedStep!]} ready`:(run.status==="needs-review"?"Needs your review":`Stopped: ${DAILY_PREPARATION_LABELS[run.step]}`)} · {run.progress.lineName}</p>
      <p>{run.progress.collected ?? 0} stories collected · {run.progress.evaluated} evaluated{run.progress.recommendationRunId?" · Recommendation ready":""} · Started {new Date(run.startedAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
      {(run.progress.activity?.length || run.progress.storyTitle) ? <div className={styles.runStory}>
        <section aria-label="What happened">
          <h3>What happened</h3>
          <ol className={styles.runTimeline}>
            {(run.progress.activity ?? []).map((entry,index)=><li key={`${entry.at}:${index}`} data-kind={entry.kind ?? "info"}><time dateTime={entry.at}>{clock(entry.at)}</time><span>{entry.text}</span></li>)}
            {running ? <li data-kind="now"><time>now</time><span>{DAILY_PREPARATION_LABELS[run.step]}</span></li> : null}
          </ol>
          {!run.progress.activity?.length ? <p><small>This run started before the timeline existed.</small></p> : null}
          <RunCalls calls={data?.calls ?? []} />
        </section>
        {run.progress.storyTitle ? <section aria-label="The story" className={styles.runCard}>
          <h3>The story</h3>
          <strong>{run.progress.storyTitle}</strong>
          {run.progress.selection?.reason ? <p>Why: {run.progress.selection.reason}</p> : null}
          {run.progress.selection?.alternatives.length ? <p><small>Also considered: {run.progress.selection.alternatives.join(" · ")}</small></p> : null}
          {run.progress.editorialDirection ? <p><small>Focus: {run.progress.editorialDirection}</small></p> : null}
          {run.progress.draftSummary ? <p><small>Script: {run.progress.draftSummary.format}, {run.progress.draftSummary.slides} slides{run.progress.draftSummary.hook ? ` · “${run.progress.draftSummary.hook}”` : ""}</small></p> : null}
        </section> : null}
      </div> : null}
      {run.progress.draftId
        // The draft's current images, wherever they were generated; the script's slides until there are any.
        ? <RunImages key={`${run.progress.draftId}:${run.progress.assetBatchId ?? ""}:${data?.slides?.version ?? ""}`} topicId={topicId} draftId={run.progress.draftId} secret={secret} draftApproved={data?.slides?.status === "approved"} disabled={disabled || running}
            fallback={data?.slides?.units.length ? <RunSlidesPreview slides={data.slides} /> : null} />
        : null}
      {run.progress.collectionWarning && <p role="status">{run.progress.collectionWarning}</p>}
      {run.progress.evaluationWarning && <p role="status">{run.progress.evaluationWarning}</p>}
      {run.progress.skippedStories?.length ? <div role="status"><p>Skipped {run.progress.skippedStories.length === 1 ? "1 story" : `${run.progress.skippedStories.length} stories`} and moved to the next one:</p><ul>{run.progress.skippedStories.map(story=><li key={story.storyId}>{story.title || "Untitled story"}: {story.reason}</li>)}</ul></div> : null}
      {run.progress.autoApproved ? <p role="status">Approved automatically:{run.progress.autoApproved.draftApprovedAt ? " script" : ""}{run.progress.autoApproved.assetIds?.length ? `${run.progress.autoApproved.draftApprovedAt ? " and" : ""} ${run.progress.autoApproved.assetIds.length} images` : ""}. Review them in the draft before publishing.</p> : null}
      {run.error && <p role="alert">{run.error}</p>}
      {run.progress.storyId && run.status!=="running" && <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={()=>props.onViewContent(run.progress.storyId!)}>Review content</button>
        {(run.progress.briefId || run.progress.draftId) && <button type="button" className={styles.primaryButton} disabled={disabled} onClick={()=>onOpenDraft(run.progress.storyId!,run.progress.storyTitle ?? "Creative draft",run.progress.draftId,run.id)}>{run.progress.draftId?"Open draft":"Open creative brief"}</button>}
        {run.status==="needs-review" && run.step==="brief" && run.error===BRIEF_EVIDENCE_REVIEW_MESSAGE && run.progress.briefId && <button type="button" className={styles.secondaryButton} disabled={disabled || pending} onClick={()=>void acknowledgeBrief()}>Accept brief and continue</button>}
      </div>}
      {run.status==="needs-review" && run.step==="brief" && run.error===BRIEF_EVIDENCE_REVIEW_MESSAGE && <p role="status">Retrying regenerates the same brief from the same source and will keep saying this when the gap is inherent to the source (for example, a small local sample) rather than a fluke. Open the brief above to judge it yourself, then use “Accept brief and continue” instead of retrying.</p>}
    </>}
  </section>;
}
