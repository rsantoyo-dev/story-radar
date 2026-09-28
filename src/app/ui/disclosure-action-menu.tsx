"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A native disclosure for a short list of ordinary buttons and links. */
export function DisclosureActionMenu({
  label,
  children,
  className,
  panelClassName,
  iconClassName,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  iconClassName?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    const panel = panelRef.current;
    if (!details || !panel) return;
    const menuDetails: HTMLDetailsElement = details;
    const menuPanel: HTMLDivElement = panel;

    function keepPanelInViewport() {
      if (!menuDetails.open) {
        menuPanel.style.transform = "";
        return;
      }
      menuPanel.style.transform = "";
      const bounds = menuPanel.getBoundingClientRect();
      const viewportWidth = menuDetails.ownerDocument.defaultView?.innerWidth ?? window.innerWidth;
      const inset = 8;
      const shift = bounds.left < inset
        ? inset - bounds.left
        : bounds.right > viewportWidth - inset
          ? viewportWidth - inset - bounds.right
          : 0;
      if (shift) menuPanel.style.transform = `translateX(${Math.round(shift)}px)`;
    }

    function closeWhenOutside(event: Event) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }
    details.addEventListener("toggle", keepPanelInViewport);
    window.addEventListener("resize", keepPanelInViewport);
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("focusin", closeWhenOutside);
    return () => {
      details.removeEventListener("toggle", keepPanelInViewport);
      window.removeEventListener("resize", keepPanelInViewport);
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("focusin", closeWhenOutside);
    };
  }, []);

  function closeAndFocusTrigger() {
    const details = detailsRef.current;
    if (!details) return;
    details.open = false;
    details.querySelector<HTMLElement>("summary")?.focus();
  }

  return (
    <details
      ref={detailsRef}
      className={className}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !detailsRef.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        closeAndFocusTrigger();
      }}
    >
      <summary aria-label={label} title={label}>
        <svg className={iconClassName} viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </summary>
      <div
        ref={panelRef}
        className={panelClassName}
        onClick={(event) => {
          const target = event.target;
          const item = target instanceof Element ? target.closest("button, a[href]") : null;
          if (!item) return;
          if (item.matches("a[href]")) {
            if (detailsRef.current) detailsRef.current.open = false;
          } else closeAndFocusTrigger();
        }}
      >
        {children}
      </div>
    </details>
  );
}
