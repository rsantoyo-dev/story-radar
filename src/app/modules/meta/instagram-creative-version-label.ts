/**
 * Human label for a publication's linked creative version (IG-06):
 * `"Carrusel · v3 · aprobado"`. Pure — unit-tested. Kept out of
 * `story-instagram-results.ts` (which is `server-only`) so it stays importable
 * from a test.
 */

const FORMAT_LABEL: Record<string, string> = {
  image: "Foto",
  carousel: "Carrusel",
  reel: "Reel",
  video: "Vídeo",
  meme: "Meme",
};

export function instagramCreativeVersionLabel(input: {
  format: string;
  status: string;
  version: number | null;
}): string {
  const format = FORMAT_LABEL[input.format] ?? input.format;
  const version =
    input.version != null && input.version > 0 ? ` · v${input.version}` : "";
  const approved = input.status === "approved" ? " · aprobado" : "";
  return `${format}${version}${approved}`;
}
