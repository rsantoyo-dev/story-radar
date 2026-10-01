/**
 * The one way out of a workspace conflict, read from the server's message.
 * Messages are server constants; the tests pin each pattern so a reworded
 * message fails loudly here instead of silently losing its button.
 */
export type WorkspaceErrorAction =
  | { kind: "reload"; label: string }
  | { kind: "tab"; tab: "focus" | "script" | "visuals"; label: string }
  | { kind: "refresh-references"; label: string };

const RULES: { pattern: RegExp; action: WorkspaceErrorAction }[] = [
  { pattern: /brand reference changed|brand reference is disabled|Refresh references/i, action: { kind: "refresh-references", label: "Refresh references" } },
  { pattern: /Reload before|changed\. Reload|still running\. Reload/i, action: { kind: "reload", label: "Reload" } },
  { pattern: /Refresh the (creative )?brief|story was edited|story content or creative profile changed/i, action: { kind: "tab", tab: "focus", label: "Go to Focus to refresh the brief" } },
  { pattern: /Approve the current script|change Place fidelity on the Script tab/i, action: { kind: "tab", tab: "script", label: "Go to Script" } },
  { pattern: /Update the pending images|images to match the saved text/i, action: { kind: "tab", tab: "visuals", label: "Go to Visuals" } },
];

export function workspaceErrorAction(message: string): WorkspaceErrorAction | undefined {
  return RULES.find((rule) => rule.pattern.test(message))?.action;
}
