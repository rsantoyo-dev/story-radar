/** Explicit editor-approved lettering stored in the visual identity, not inferred from references. */
export function brandLettering(guidance: string, order: number, total: number, pngEnabled = false): string[] {
  if (pngEnabled || (order !== 1 && order !== total)) return [];
  const match = guidance.match(/<BRAND_LETTERING>([\s\S]*?)<\/BRAND_LETTERING>/);
  if (!match) return [];
  try {
    const lines: unknown = JSON.parse(match[1]);
    if (!Array.isArray(lines) || !lines.length || lines.length > 3 ||
      lines.some(line => typeof line !== "string" || !line.trim() || line.length > 120 || /[<>\r\n]/.test(line))) return [];
    return lines.map(line => line.trim());
  } catch { return []; }
}
