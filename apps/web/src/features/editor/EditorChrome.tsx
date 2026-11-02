import { useMemo, useState } from 'react';

import { controlDeclSchema, type ControlDecl, type EditorCommand, type GameManifest } from '@ogm/contracts';

import type { EditorSessionState } from './session';
import { HintStrip } from './HintStrip';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { Rail } from './Rail';
import { loadSnapPrefs, saveSnapPrefs, type SnapPrefs } from './SnapPrefs';
import { Tools } from './Tools';
import './editor.css';

type EditorChromeProps = {
  gameId: string;
  manifest: GameManifest;
  session: EditorSessionState;
  onCommand(command: EditorCommand): void;
  onTool(tool: string): void;
  onUndo(): void;
  onRedo(): void;
};

export function EditorChrome({ gameId, manifest, session, onCommand, onTool, onUndo, onRedo }: EditorChromeProps) {
  const [category, setCategory] = useState(manifest.palette.categories[0]?.id ?? '');
  const [pickedPrefab, setPickedPrefab] = useState<string>();
  const [snap, setSnap] = useState<SnapPrefs>(() => loadSnapPrefs(gameId, manifest.grid?.size ?? 1));
  const controls = useMemo(() => manifestControls(manifest), [manifest]);
  const picked = manifest.palette.items.find((item) => item.prefab === pickedPrefab);
  const updateSnap = (next: SnapPrefs) => {
    setSnap(next);
    saveSnapPrefs(gameId, next);
  };

  return (
    <div className="editor-chrome">
      <Rail categories={manifest.palette.categories} active={category} onChange={setCategory} />
      <Palette
        palette={manifest.palette}
        category={category}
        onCategory={setCategory}
        onPick={(prefab) => {
          setPickedPrefab(prefab);
          onTool('place');
        }}
      />
      <Tools
        tools={manifest.tools}
        active={session.tool}
        snap={snap}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        onTool={onTool}
        onSnap={updateSnap}
        onUndo={onUndo}
        onRedo={onRedo}
      />
      <Inspector doc={session.doc} selectedIds={session.selection} controls={controls} onCommand={onCommand} />
      <HintStrip hint={picked?.hint} />
    </div>
  );
}

function manifestControls(manifest: GameManifest): ControlDecl[] {
  const value = (manifest as GameManifest & { controls?: unknown }).controls;
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const parsed = controlDeclSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}
