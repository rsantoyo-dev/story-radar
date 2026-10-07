import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import type { CapabilityState, ChannelCapabilities } from "../modules/meta/channel-capabilities";
import { ModalLayer } from "./modal-layer";
import styles from "./primitives.generated.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ControlSize = "compact" | "regular";

function classes(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ControlSize;
  busy?: boolean;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  quiet: styles.buttonQuiet,
  destructive: styles.buttonDestructive,
};

export function Button({ variant = "secondary", size = "regular", busy = false, disabled, className, children, type = "button", ...props }: ButtonProps) {
  return <button {...props} data-ui-button="" type={type} className={classes(styles.button, buttonVariants[variant], size === "compact" && styles.buttonCompact, className)} disabled={disabled || busy} aria-busy={busy || undefined}>
    {children}
  </button>;
}

export function IconButton({ "aria-label": label, className, ...props }: ButtonProps & { "aria-label": string }) {
  return <Button {...props} aria-label={label} className={classes(styles.iconButton, className)} />;
}

/** A single centred panel on its own page (sign-in, access messages). */
export function CenteredPanel({ title, children }: { title: string; children: ReactNode }) {
  return <main className={styles.centeredPage}>
    <section className={classes(styles.surface, styles.centeredPanel)} aria-labelledby="centered-panel-title">
      <h1 id="centered-panel-title">{title}</h1>
      {children}
    </section>
  </main>;
}

export function Divider({ children }: { children: ReactNode }) {
  return <div className={styles.divider} role="separator">{children}</div>;
}

export function Surface({ tone = "default", className, ...props }: HTMLAttributes<HTMLElement> & { tone?: "default" | "subtle" }) {
  return <section {...props} className={classes(styles.surface, tone === "subtle" && styles.surfaceSubtle, className)} />;
}

export function SectionHeader({ eyebrow, title, description, actions, level = 2, className }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode; level?: 2 | 3; className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return <div className={classes(styles.sectionHeader, className)}>
    <div>{eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<Heading>{title}</Heading>{description && <p className={styles.description}>{description}</p>}</div>
    {actions && <div className={styles.headerActions}>{actions}</div>}
  </div>;
}

export function FormField({ label, description, error, optional, required, children, className }: {
  label: string; description?: string; error?: string; optional?: boolean; required?: boolean; children: ReactNode; className?: string;
}) {
  const generatedId = useId();
  const control = isValidElement<Record<string, unknown>>(children) ? children : undefined;
  const controlId = typeof control?.props.id === "string" ? control.props.id : generatedId;
  const describedBy = [
    typeof control?.props["aria-describedby"] === "string" ? control.props["aria-describedby"] : undefined,
    description ? `${generatedId}-help` : undefined,
    error ? `${generatedId}-error` : undefined,
  ].filter(Boolean).join(" ") || undefined;
  return <div className={classes(styles.formField, error && styles.formFieldError, className)}>
    <label htmlFor={controlId}><span className={styles.fieldLabel}>{label}{optional && <small>Optional</small>}{required && <small>Required</small>}</span></label>
    {control ? cloneElement(control, { id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true : control.props["aria-invalid"], required: required || control.props.required }) : children}
    {description && <p id={`${generatedId}-help`} className={styles.fieldHelp}>{description}</p>}
    {error && <p id={`${generatedId}-error`} className={styles.fieldError} role="alert">{error}</p>}
  </div>;
}

export type StatusTone = "neutral" | "success" | "warning" | "error" | "info";
const badgeTones: Record<StatusTone, string> = {
  neutral: styles.statusNeutral, success: styles.statusSuccess, warning: styles.statusWarning,
  error: styles.statusError, info: styles.statusInfo,
};
const noticeTones = {
  info: styles.noticeInfo, success: styles.noticeSuccess,
  warning: styles.noticeWarning, error: styles.noticeError,
};

export function StatusBadge({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return <span className={classes(styles.statusBadge, badgeTones[tone], className)}>{children}</span>;
}

export function InlineNotice({ tone = "info", title, children, className }: { tone?: keyof typeof noticeTones; title?: string; children: ReactNode; className?: string }) {
  return <div className={classes(styles.inlineNotice, noticeTones[tone], className)} role={tone === "error" ? "alert" : "status"}>
    {title && <strong>{title}</strong>}<div>{children}</div>
  </div>;
}

export function EmptyState({ title, children, actions, className }: { title: string; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return <div className={classes(styles.emptyState, className)}><strong>{title}</strong>{children && <div>{children}</div>}{actions && <ActionRow>{actions}</ActionRow>}</div>;
}

export function LoadingState({ children = "Loading…", className }: { children?: ReactNode; className?: string }) {
  return <div className={classes(styles.loadingState, className)} role="status" aria-live="polite"><span className={styles.loadingMark} aria-hidden="true" />{children}</div>;
}

export function Tabs({ label, items, className }: { label: string; items: readonly { label: string; href: string; current?: boolean }[]; className?: string }) {
  return <nav aria-label={label} className={classes(styles.tabs, className)}>{items.map((item) => <a key={item.href} href={item.href} className={item.current ? styles.tabCurrent : undefined} aria-current={item.current ? "page" : undefined}>{item.label}</a>)}</nav>;
}

export function ActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classes(styles.actionRow, className)}>{children}</div>;
}

/**
 * Modal dialog chrome over ModalLayer's focus trap and portal: eyebrow +
 * title header, scrollable body, optional footer. Backdrop clicks and Escape
 * close it unless `canClose` is false (e.g. while a request is in flight).
 */
export function Dialog({ eyebrow, title, onClose, canClose = true, footer, children, className }: {
  eyebrow?: string; title: string; onClose: () => void; canClose?: boolean; footer?: ReactNode; children: ReactNode; className?: string;
}) {
  const headingId = useId();
  return <ModalLayer onClose={onClose} canClose={canClose}>
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && canClose) onClose();
    }}>
      <section className={classes(styles.dialog, className)} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className={styles.dialogHeader}>
          <div>{eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<h2 id={headingId}>{title}</h2></div>
          <IconButton aria-label={`Close ${title}`} variant="quiet" size="compact" onClick={onClose} disabled={!canClose}>×</IconButton>
        </header>
        <div className={styles.dialogBody}>{children}</div>
        {footer && <footer className={styles.dialogFooter}>{footer}</footer>}
      </section>
    </div>
  </ModalLayer>;
}

const capabilityTones: Record<CapabilityState, StatusTone> = {
  available: "success", "needs-attention": "warning", unavailable: "neutral", unknown: "neutral",
};
const capabilityLabels: Record<CapabilityState, string> = {
  available: "available", "needs-attention": "needs attention", unavailable: "not available", unknown: "not checked",
};

/**
 * One publishing channel (a platform connection) at a glance: who it is
 * connected as, the four capability states, details, and its next actions.
 */
export function ChannelCard({ platform, account, capabilities, details, actions, children, className }: {
  platform: string;
  account?: string;
  capabilities?: ChannelCapabilities;
  details?: readonly { label: string; value: ReactNode }[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <article className={classes(styles.channelCard, className)}>
    <header className={styles.channelCardHeader}>
      <div><h3>{platform}</h3>{account && <p>{account}</p>}</div>
      <StatusBadge tone={!capabilities ? "neutral" : capabilities.connected ? "success" : "neutral"}>
        {!capabilities ? "Checking…" : capabilities.connected ? "Connected" : "Not connected"}
      </StatusBadge>
    </header>
    {capabilities && <ActionRow>
      {([["Publish", capabilities.canPublish], ["Sync", capabilities.canSync], ["Metrics", capabilities.metricsAvailable]] as const).map(([label, state]) => (
        <StatusBadge key={label} tone={capabilityTones[state]}>{label}: {capabilityLabels[state]}</StatusBadge>
      ))}
    </ActionRow>}
    {details && details.length > 0 && <dl className={styles.channelCardDetails}>
      {details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
    </dl>}
    {children}
    {actions && <ActionRow>{actions}</ActionRow>}
  </article>;
}

/** A single-choice list of rich options (radio semantics), e.g. picking one account or Page. */
export function ChoiceList<T extends string>({ legend, name, options, value, onChange, disabled, className }: {
  legend: string;
  name: string;
  options: readonly { value: T; label: string; description?: ReactNode }[];
  value: T | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return <fieldset className={classes(styles.choiceList, className)}>
    <legend className={styles.eyebrow}>{legend}</legend>
    {options.map((option, index) => <label key={option.value} className={styles.choice}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} disabled={disabled} data-initial-focus={index === 0 ? "" : undefined} />
      <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
    </label>)}
  </fieldset>;
}
