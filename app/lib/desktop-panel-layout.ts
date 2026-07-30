export type DesktopPanelId = "code" | "projects" | "compiled" | "textures" | "model3d";

export interface PanelLayoutRect {
  top: number;
  left?: number;
  right?: number;
  width: number;
  height: number;
}

export interface DesktopPanelLayoutInput {
  openPanels: Record<DesktopPanelId, boolean>;
  renderMode: "2d" | "3d";
  enable3d: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

export interface DesktopPanelLayout {
  code?: PanelLayoutRect;
  projects?: PanelLayoutRect;
  compiled?: PanelLayoutRect;
  textures?: PanelLayoutRect;
  model3d?: PanelLayoutRect;
}

const EDGE = 14;
const HEADER = 72;
const DOCK = 80;
const GAP = 8;
const MIN_PANEL_HEIGHT = 200;

const PANEL_WIDTH: Record<DesktopPanelId, number> = {
  code: 480,
  projects: 260,
  compiled: 440,
  textures: 320,
  model3d: 360,
};

function stackColumn(
  panelIds: DesktopPanelId[],
  side: "left" | "right",
  availableHeight: number,
  viewportWidth: number,
): Partial<Record<DesktopPanelId, PanelLayoutRect>> {
  if (panelIds.length === 0) return {};

  const count = panelIds.length;
  const totalGap = GAP * Math.max(0, count - 1);
  const evenHeight = Math.max(
    MIN_PANEL_HEIGHT,
    Math.floor((availableHeight - totalGap) / count),
  );
  const heights = panelIds.map(() => evenHeight);
  const used = heights.reduce((sum, h) => sum + h, 0) + totalGap;
  if (used > availableHeight) {
    const overflow = used - availableHeight;
    const trimPerPanel = Math.ceil(overflow / count);
    for (let i = 0; i < heights.length; i += 1) {
      heights[i] = Math.max(MIN_PANEL_HEIGHT, heights[i] - trimPerPanel);
    }
  }

  const out: Partial<Record<DesktopPanelId, PanelLayoutRect>> = {};
  let y = HEADER;

  for (let i = 0; i < panelIds.length; i += 1) {
    const id = panelIds[i];
    const width = Math.min(PANEL_WIDTH[id], viewportWidth - EDGE * 2);
    const rect: PanelLayoutRect = {
      top: y,
      width,
      height: heights[i],
    };
    if (side === "left") {
      rect.left = EDGE;
    } else {
      rect.right = EDGE;
    }
    out[id] = rect;
    y += heights[i] + GAP;
  }

  return out;
}

export function computeDesktopPanelLayout(input: DesktopPanelLayoutInput): DesktopPanelLayout {
  const availableHeight = Math.max(
    MIN_PANEL_HEIGHT,
    input.viewportHeight - HEADER - DOCK - EDGE,
  );

  const leftIds: DesktopPanelId[] = [];
  if (input.openPanels.code) leftIds.push("code");
  if (input.openPanels.projects) leftIds.push("projects");

  const rightIds: DesktopPanelId[] = [];
  if (input.openPanels.compiled) rightIds.push("compiled");
  if (input.enable3d && input.renderMode === "3d" && input.openPanels.model3d) {
    rightIds.push("model3d");
  }
  if (input.openPanels.textures) rightIds.push("textures");

  return {
    ...stackColumn(leftIds, "left", availableHeight, input.viewportWidth),
    ...stackColumn(rightIds, "right", availableHeight, input.viewportWidth),
  };
}
