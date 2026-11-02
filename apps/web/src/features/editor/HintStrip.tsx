export function HintStrip({ hint }: { hint?: string }) {
  return hint ? <div className="editor-hint">{hint}</div> : null;
}
