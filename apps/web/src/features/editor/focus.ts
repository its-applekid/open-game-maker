export const EDITOR_FOCUS_ZONES = {
  bar: 'editor-bar',
  rail: 'editor-rail',
  palette: 'editor-palette',
  canvas: 'editor-canvas',
  inspector: 'editor-inspector',
} as const;

export type EditorFocusZone = (typeof EDITOR_FOCUS_ZONES)[keyof typeof EDITOR_FOCUS_ZONES];
