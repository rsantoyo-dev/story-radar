"use client";
import { useEffect, useState } from "react";
import type { EditorialLine, EditorialLineConfig, EditorialPeriod, EditorialCollectionContext, LineResearchSettings } from "./modules/editorial-lines/editorial-lines";
import styles from "./radar-dashboard.generated.module.css";
export type EditorialLineSelection={topicId:string;lineId:string;query:string;period?:EditorialPeriod};
export type EditorialLinesData={topicId:string;researchDefaults:LineResearchSettings & {enabled:boolean};lines:EditorialLine[];associations:{storyId:string;runId:string;context:EditorialCollectionContext;reasons:string[]}[];sources:{id:string;name:string;enabled:boolean}[];runs:{id:string;status:string;error?:string;context?:EditorialCollectionContext;result?:{sources?:{details?:{sourceId:string;sourceName:string;error?:string}[]};coverage?:string;persistence?:{persistedStories:number}}}[]};
const empty:EditorialLineConfig={name:"",objective:"",themes:[],mode:"context",period:{kind:"relative",hours:8760},timezone:"UTC",sourceMode:"inherit",sourceIds:[],excludedSourceIds:[],domains:[],researchEnabled:true};
export function EditorialLinesPanel({topicId,secret,disabled=false,manageOnly=false,refreshKey=0,onSelection,onLoaded}:{topicId:string;secret:string;disabled?:boolean;manageOnly?:boolean;refreshKey?:number;onSelection?:(s:EditorialLineSelection|undefined)=>void;onLoaded?:(data:EditorialLinesData)=>void}){
  const [data,setData]=useState<EditorialLinesData>();const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [revision,setRevision]=useState(0);
  const [choice,setChoice]=useState("");const [query,setQuery]=useState("");
  const [editing,setEditing]=useState<EditorialLine>();const [config,setConfig]=useState<EditorialLineConfig>(empty);
  const current=data?.topicId===topicId?data:undefined;
  useEffect(()=>{if(!secret.trim()||!topicId)return;const controller=new AbortController();
    fetch(`/api/radar/topics/${topicId}/editorial-lines`,{headers:{Authorization:`Bearer ${secret.trim()}`},signal:controller.signal,cache:"no-store"}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.error);return {...value,topicId} as EditorialLinesData;}).then(value=>{if(controller.signal.aborted)return;setData(value);setError("");onLoaded?.(value);if(!manageOnly && !value.lines.some(line=>line.id===choice&&!line.archived)){const active=value.lines.filter(line=>!line.archived);const next=active.length===1?active[0]:undefined;setChoice(next?.id??"");setQuery("");onSelection?.(next?{topicId,lineId:next.id,query:""}:undefined);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
  },[topicId,secret,revision,refreshKey,onLoaded,choice,onSelection,manageOnly]);
  useEffect(()=>{
    const changed=(event:Event)=>{if((event as CustomEvent<string>).detail===topicId)setRevision(n=>n+1);};
    window.addEventListener("editorial-lines-changed",changed);
    return()=>window.removeEventListener("editorial-lines-changed",changed);
  },[topicId]);
  const selected=current?.lines.find(l=>l.id===choice&&!l.archived);
  const updateSelection=(id:string,q:string,p?:EditorialPeriod)=>{setChoice(id);setQuery(q);onSelection?.(id?{topicId,lineId:id,query:q,period:p}:undefined);};
  async function save(archive=false){setBusy(true);setError("");try{
    const r=await fetch(`/api/radar/topics/${topicId}/editorial-lines`,{method:"POST",headers:{Authorization:`Bearer ${secret.trim()}`,"Content-Type":"application/json"},body:JSON.stringify({id:editing?.id,revision:editing?.revision,archived:archive,config})});const value=await r.json();if(!r.ok)throw new Error(value.error);setEditing(undefined);setConfig(empty);window.dispatchEvent(new CustomEvent("editorial-lines-changed",{detail:topicId}));if(archive&&editing?.id===choice)updateSelection("","",undefined);
  }catch(e){setError(e instanceof Error?e.message:"Unable to save line");}finally{setBusy(false);}}
  return <div>
    {error?<p role="alert">{error}</p>:null}
    {!manageOnly?<>
      <label className={styles.field}><span>Editorial line</span><select value={selected?.id??""} disabled={disabled||busy} onChange={e=>updateSelection(e.target.value,"",undefined)}><option value="" disabled>Choose an editorial line</option>{current?.lines.filter(l=>!l.archived).map(l=><option key={l.id} value={l.id}>{l.name} · {l.mode}</option>)}</select></label>
      <p>Choose a saved line and collect using its feeds, AI search and period. <a href="#configuration">Configure lines in Topics &amp; Sources</a>.</p>
      {selected?<><p>{selected.objective}</p><small>Period: {periodLabel(selected.period)} · {selected.timezone}. Feeds: {current?.sources.filter(s=>s.enabled&&(selected.sourceMode==="inherit"||selected.sourceIds.includes(s.id))&&!selected.excludedSourceIds.includes(s.id)).map(s=>s.name).join(", ")||"No RSS sources"}. AI search: {researchLabel(selected,current?.researchDefaults)}.</small>
        <label className={styles.field}><span>Research today (optional)</span><textarea value={query} maxLength={2000} disabled={disabled} onChange={e=>updateSelection(choice,e.target.value)} /></label></>:null}
      <details><summary>Recent collection results</summary>{current?.runs.map(run=><p key={run.id}>{run.context?.name??"Brand collection"} · {run.status} {run.result?.persistence?`· ${run.result.persistence.persistedStories} candidates`:""}{run.error?` · ${run.error}`:""}{run.result?.sources?.details?.filter(s=>s.error).map(s=><small key={s.sourceId}> {s.sourceName}: {s.error}</small>)}{run.result?.coverage?<small> {run.result.coverage}</small>:null}</p>)}</details>
    </>:null}
    {manageOnly?<details><summary>Manage editorial lines</summary>
      <p>Configure each line here, then choose it in Collection. Combine feeds and AI search, or use either independently.</p>
      <div className={styles.buttonRow}>{current?.lines.map(line=><button key={line.id} type="button" className={styles.secondaryButton} disabled={busy||disabled} onClick={()=>{setEditing(line);setConfig(line);}}>{line.name}{line.isDefault?" (default)":""}{line.archived?" (archived)":""}</button>)}<button type="button" className={styles.secondaryButton} onClick={()=>{setEditing(undefined);setConfig(empty);}}>New line</button></div>
      <fieldset disabled={busy||disabled||!secret.trim()}>
        <label className={styles.field}>Name<input value={config.name} maxLength={100} onChange={e=>setConfig({...config,name:e.target.value})}/></label>
        <label className={styles.field}>Objective<textarea value={config.objective} maxLength={2000} onChange={e=>setConfig({...config,objective:e.target.value})}/></label>
        <label className={styles.field}>Themes (comma separated)<input value={config.themes.join(",")} onChange={e=>setConfig({...config,themes:e.target.value.split(",")})}/></label>
        <label className={styles.field}>Editorial mode<select value={config.mode} onChange={e=>setConfig({...config,mode:e.target.value as EditorialLineConfig["mode"]})}><option value="news">News</option><option value="context">Context / studies</option><option value="guide">Practical guide</option></select></label>
        <PeriodEditor value={config.period} onChange={period=>setConfig({...config,period})}/>
        <label className={styles.field}>Timezone (IANA)<input value={config.timezone} onChange={e=>setConfig({...config,timezone:e.target.value})}/></label>
        <label className={styles.field}>RSS feeds<select value={config.sourceMode} onChange={e=>setConfig({...config,sourceMode:e.target.value as "inherit"|"selected"})}><option value="inherit">Inherit active brand feeds</option><option value="selected">Selected feeds only (none = AI only)</option></select></label>
        {current?.sources.map(source=><label key={source.id} className={styles.field}><span>{source.name}{source.enabled?"":" (disabled at brand level)"}</span><select value={config.excludedSourceIds.includes(source.id)?"exclude":config.sourceIds.includes(source.id)?"include":"default"} onChange={e=>setConfig({...config,sourceIds:[...config.sourceIds.filter(id=>id!==source.id),...(e.target.value==="include"?[source.id]:[])],excludedSourceIds:[...config.excludedSourceIds.filter(id=>id!==source.id),...(e.target.value==="exclude"?[source.id]:[])]})}><option value="default">Default</option><option value="include">Include</option><option value="exclude">Exclude</option></select></label>)}
        <ResearchEditor config={config} defaults={current?.researchDefaults} onChange={setConfig}/>
        <label className={styles.field}>Allowed publisher domains (comma separated; empty = unrestricted)<input value={config.domains.join(",")} onChange={e=>setConfig({...config,domains:e.target.value?e.target.value.split(","):[]})}/></label>
        <p>RSS feeds do not guarantee historical coverage. No age cutoff still uses bounded searches. Collection does not approve or publish stories.</p>
        <div className={styles.buttonRow}><button type="button" className={styles.primaryButton} onClick={()=>save(false)}>{busy?"Saving…":editing?.archived?"Restore line":"Save line"}</button>{editing&&!editing.archived&&!editing.isDefault?<button type="button" className={styles.secondaryButton} onClick={()=>save(true)}>Archive line</button>:null}</div>
      </fieldset>
    </details>:null}
  </div>;
}
function periodLabel(p:EditorialPeriod){return p.kind==="relative"?`${p.hours} hours`:p.kind==="any"?"No age cutoff":`${p.from} → ${p.to}`;}
function PeriodEditor({value,onChange}:{value:EditorialPeriod;onChange:(p:EditorialPeriod)=>void}){
  return <div><label className={styles.field}>Period<select value={value.kind} onChange={e=>onChange(e.target.value==="any"?{kind:"any"}:e.target.value==="relative"?{kind:"relative",hours:72}:{kind:"range",from:new Date(Date.now()-86400000).toISOString(),to:new Date().toISOString()})}><option value="relative">Relative hours</option><option value="range">Exact range</option><option value="any">No age cutoff</option></select></label>{value.kind==="relative"?<label className={styles.field}>Hours (72 = 3 days; 8760 = 365 days)<input type="number" min={1} max={87600} value={value.hours} onChange={e=>onChange({...value,hours:Number(e.target.value)})}/></label>:value.kind==="range"?<><label className={styles.field}>From (ISO date/time with offset)<input value={value.from} onChange={e=>onChange({...value,from:e.target.value})}/></label><label className={styles.field}>To (ISO date/time with offset)<input value={value.to} onChange={e=>onChange({...value,to:e.target.value})}/></label></>:null}</div>;
}


function researchLabel(line:EditorialLineConfig,defaults?:LineResearchSettings & {enabled:boolean}){
  const mode=line.research?.mode??(line.researchEnabled?"inherit":"disabled");
  return mode==="disabled"?"off":mode==="custom"?"custom settings for this line":defaults?.enabled?"brand defaults":"brand defaults (currently disabled)";
}
function ResearchEditor({config,defaults,onChange}:{config:EditorialLineConfig;defaults?:LineResearchSettings & {enabled:boolean};onChange:(config:EditorialLineConfig)=>void}){
  const mode=config.research?.mode??(config.researchEnabled?"inherit":"disabled");
  const custom=config.research?.mode==="custom"?config.research:undefined;
  const update=(patch:Partial<LineResearchSettings>)=>{if(custom)onChange({...config,research:{...custom,...patch}});};
  return <>
    <label className={styles.field}>AI web search<select value={mode} onChange={e=>{
      const mode=e.target.value as "inherit"|"disabled"|"custom";
      onChange({...config,researchEnabled:mode!=="disabled",research:mode==="custom"?{
        instruction:defaults?.instruction||config.objective,orientation:defaults?.orientation??"informative",
        resultLimit:defaults?.resultLimit??5,language:defaults?.language??"es",region:defaults?.region??"",
        includeContent:defaults?.includeContent??true,priority:defaults?.priority??50,mode
      }:{mode}});
    }}><option value="inherit">Inherit brand AI search</option><option value="custom">Custom AI search for this line</option><option value="disabled">Disabled (feeds only)</option></select></label>
    {mode==="inherit"?<p>{defaults?.enabled?"Brand AI search is enabled.":"Brand AI search is disabled; choose custom to enable it for this line."} {defaults? `${defaults.resultLimit} results · ${defaults.language} · ${defaults.region} · ${defaults.orientation}`:""} The line&apos;s period applies.</p>:null}
    {custom?<>
      <p>This line runs its own AI search using the existing providers. Its period, objective, themes and publisher domains apply automatically.</p>
      <label className={styles.field}>Search instruction<textarea maxLength={2000} value={custom.instruction} onChange={e=>update({instruction:e.target.value})}/></label>
      <label className={styles.field}>Orientation<select value={custom.orientation} onChange={e=>update({orientation:e.target.value as LineResearchSettings["orientation"]})}><option value="informative">Informative</option><option value="trend">Trend</option><option value="provocative">Provocative</option></select></label>
      <label className={styles.field}>Maximum results<input type="number" min={1} max={10} value={custom.resultLimit} onChange={e=>update({resultLimit:Number(e.target.value)})}/></label>
      <label className={styles.field}>Language<input maxLength={32} value={custom.language} onChange={e=>update({language:e.target.value})}/></label>
      <label className={styles.field}>Region<input maxLength={80} value={custom.region} onChange={e=>update({region:e.target.value})}/></label>
      <label className={styles.field}>Priority<input type="number" min={0} max={100} value={custom.priority} onChange={e=>update({priority:Number(e.target.value)})}/></label>
      <label className={styles.field}><span>Retrieve article content</span><input type="checkbox" checked={custom.includeContent} onChange={e=>update({includeContent:e.target.checked})}/></label>
    </>:null}
  </>;
}
