/**
 * Where an inset map card lies on a slide. Bottom right is where it always
 * lay and stays the default; the editor may move it to the top right (below
 * any logo at the top) or the bottom left (beside the page counter) when the
 * slide's words need its corner. Pure, so the canvas can offer the choice.
 */
export type MapPanelPosition = "bottom-right" | "top-right" | "bottom-left";
export const MAP_PANEL_POSITIONS: readonly MapPanelPosition[] = ["bottom-right", "top-right", "bottom-left"];
