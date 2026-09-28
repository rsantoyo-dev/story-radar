"use client";

import { useId, useState } from "react";

import { Button } from "@/app/ui/primitives";
import { ModalLayer } from "@/app/ui/modal-layer";
import styles from "@/app/radar-dashboard.generated.module.css";

export function ModalFixture() {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  return <>
    <Button onClick={() => setOpen(true)}>Open dialog fixture</Button>
    {open ? <ModalLayer onClose={() => setOpen(false)}>
      <div className={styles.contentViewerBackdrop} role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
        <section className={styles.contentViewer} role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <header className={styles.contentViewerHeader}>
            <div><p>Safe fixture</p><h2 id={headingId}>Dialog focus</h2></div>
            <Button variant="quiet" onClick={() => setOpen(false)} aria-label="Close dialog">×</Button>
          </header>
          <div className={styles.newStoryForm}>
            <label className={styles.field}>Fixture title<input data-initial-focus defaultValue="Sample Story" /></label>
            <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </section>
      </div>
    </ModalLayer> : null}
  </>;
}
