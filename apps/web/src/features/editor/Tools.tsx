import type { GameManifest } from '@ogm/contracts/browser';

import type { SnapPrefs } from './SnapPrefs';

type ToolsProps = {
  tools: GameManifest['tools'];
  active: string;
  snap: SnapPrefs;
  canUndo: boolean;
  canRedo: boolean;
  onTool(tool: string): void;
  onSnap(prefs: SnapPrefs): void;
  onUndo(): void;
  onRedo(): void;
};

export function Tools({ tools, active, snap, canUndo, canRedo, onTool, onSnap, onUndo, onRedo }: ToolsProps) {
  return (
    <div className="editor-tools" aria-label="Tools">
      {tools.map((tool) => (
        <button
          className="tap-secondary"
          type="button"
          key={tool}
          aria-pressed={tool === active}
          onClick={() => onTool(tool)}
        >
          {tool}
        </button>
      ))}
      <button className="tap-secondary" type="button" disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
      <button className="tap-secondary" type="button" disabled={!canRedo} onClick={onRedo}>
        Redo
      </button>
      <label className="snap-toggle">
        <input
          type="checkbox"
          checked={snap.enabled}
          onChange={(event) => onSnap({ ...snap, enabled: event.currentTarget.checked })}
        />
        Snap
      </label>
      <label className="grid-size">
        Grid
        <input
          type="number"
          min="0.125"
          max="1024"
          step="0.125"
          value={snap.grid}
          onChange={(event) => {
            if (event.currentTarget.valueAsNumber > 0) onSnap({ ...snap, grid: event.currentTarget.valueAsNumber });
          }}
        />
      </label>
    </div>
  );
}
