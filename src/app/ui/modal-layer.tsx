"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PALETTE_ROLES = ["primary", "secondary", "surface", "tertiary", "dark", "neutral", "light"] as const;
const PALETTE_TONES = ["main", "light", "dark", "contrast"] as const;

/** Keeps an open dialog above the application and returns focus to its trigger. */
export function ModalLayer({ children, onClose, canClose = true }: {
  children: ReactNode;
  onClose: () => void;
  canClose?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const themeSource = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    // Portals leave the Topic shell in the DOM. Carry its resolved palette
    // onto the portal so dialog controls keep the same Topic identity.
    if (themeSource.current) {
      const sourceStyle = getComputedStyle(themeSource.current);
      for (const role of PALETTE_ROLES) {
        for (const tone of PALETTE_TONES) {
          const property = `--uxdsl__palette__${role}-${tone}`;
          const value = sourceStyle.getPropertyValue(property);
          if (value) container.style.setProperty(property, value);
        }
      }
    }
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== container)
      .map((element) => ({ element, inert: element.inert }));

    siblings.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    const focusTarget = container.querySelector<HTMLElement>("[data-initial-focus]")
      ?? container.querySelector<HTMLElement>(FOCUSABLE);
    focusTarget?.focus();

    return () => {
      siblings.forEach(({ element, inert }) => { element.inert = inert; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else {
        const fallback = document.querySelector<HTMLElement>("main h1, main, header a");
        if (fallback) {
          if (!fallback.matches(FOCUSABLE)) fallback.tabIndex = -1;
          fallback.focus();
        }
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const container = root.current;
      if (!container) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (canClose) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => element.getClientRects().length > 0);
      if (controls.length === 0) {
        event.preventDefault();
        container.tabIndex = -1;
        container.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [canClose, onClose]);

  if (typeof document === "undefined") return null;
  return <Fragment>
    <span ref={themeSource} hidden aria-hidden="true" />
    {createPortal(<div ref={root} data-modal-root="">{children}</div>, document.body)}
  </Fragment>;
}
