import { useEffect, useState, type KeyboardEvent } from 'react';

import type { MergeConflict } from '@ogm/contracts/browser';

import type { DesignSnapshot } from '../../../features/editor/api';
import { allowsBoth, type ConflictResolution } from './resolution';
import { displayValue, SideBySide } from './SideBySide';

const LABELS: Record<MergeConflict['kind'], string> = {
  both_changed: 'Both of you changed this',
  delete_vs_edit: 'One side removed it',
  control_removed: 'A newer build removed this control',
};

export function ConflictCard({
  conflict,
  gameId,
  mine,
  theirs,
  resolution,
  disabled = false,
  onResolve,
}: {
  conflict: MergeConflict;
  gameId: string;
  mine: DesignSnapshot;
  theirs: DesignSnapshot;
  resolution?: ConflictResolution;
  disabled?: boolean;
  onResolve(resolution: ConflictResolution): void;
}) {
  const mineValue = sideValue(conflict.ours);
  const theirsValue = sideValue(conflict.theirs);
  const scalar = scalarValue(mineValue) ?? scalarValue(theirsValue);
  const selected = typeof resolution === 'string' ? resolution : resolution === undefined ? undefined : 'value';
  const [custom, setCustom] = useState(() =>
    resolution !== undefined && typeof resolution === 'object'
      ? displayValue(resolution.value)
      : displayValue(scalar ?? ''),
  );

  useEffect(() => {
    if (resolution !== undefined && typeof resolution === 'object') setCustom(displayValue(resolution.value));
  }, [resolution]);

  const saveCustom = () => {
    if (custom.trim() === '') return;
    onResolve({ value: parseScalar(custom, scalar) });
  };
  const onCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCustom();
    }
  };

  return (
    <article className="merge-conflict" aria-label={`Conflict ${conflict.path}`}>
      <header>
        <div>
          <p>{LABELS[conflict.kind]}</p>
          <h2>{conflict.controlId ?? conflict.path}</h2>
        </div>
        <code>{conflict.path}</code>
      </header>
      <div className="merge-values">
        <p>
          Mine: <strong>{displayValue(mineValue)}</strong>
        </p>
        <p>
          Theirs: <strong>{displayValue(theirsValue)}</strong>
        </p>
      </div>
      <SideBySide
        gameId={gameId}
        entityId={conflict.entityId}
        mine={mine}
        theirs={theirs}
        mineValue={mineValue}
        theirsValue={theirsValue}
      />
      <div className="merge-choices" role="group" aria-label="Resolution">
        <Choice label="Mine" selected={selected === 'ours'} disabled={disabled} onClick={() => onResolve('ours')} />
        <Choice
          label="Theirs"
          selected={selected === 'theirs'}
          disabled={disabled}
          onClick={() => onResolve('theirs')}
        />
        {allowsBoth(conflict) ? (
          <Choice label="Both" selected={selected === 'both'} disabled={disabled} onClick={() => onResolve('both')} />
        ) : null}
        {scalar !== undefined ? (
          <label className="merge-custom-value">
            Value
            <input
              aria-label="Custom value"
              disabled={disabled}
              value={custom}
              onBlur={saveCustom}
              onChange={(event) => setCustom(event.currentTarget.value)}
              onKeyDown={onCustomKeyDown}
            />
          </label>
        ) : null}
      </div>
    </article>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button className="tap-primary" type="button" aria-pressed={selected} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

function sideValue(side: MergeConflict['ours']): unknown {
  return typeof side === 'object' ? side.after : side;
}

function scalarValue(value: unknown): string | number | boolean | null | undefined {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
    ? (value as string | number | boolean | null)
    : undefined;
}

function parseScalar(value: string, example: string | number | boolean | null | undefined): unknown {
  if (typeof example === 'string') return value;
  if (typeof example === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (typeof example === 'boolean') return value.trim().toLocaleLowerCase() === 'true';
  if (example === null) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}
