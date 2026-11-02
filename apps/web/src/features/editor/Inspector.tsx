import type { ControlDecl, DesignDoc, EditorCommand, Entity } from '@ogm/contracts';

import { FocusZone } from '../../lib/input';
import { EDITOR_FOCUS_ZONES } from './focus';

type InspectorProps = {
  doc: DesignDoc;
  selectedIds: readonly string[];
  controls: readonly ControlDecl[];
  onCommand(command: EditorCommand): void;
};

type ControlContext = {
  control: ControlDecl;
  targets: Extract<EditorCommand, { op: 'set' }>['targets'];
  value: unknown;
  scopeLabel: string;
};

export function Inspector({ doc, selectedIds, controls, onCommand }: InspectorProps) {
  const selected = selectedIds.map((id) => doc.entities[id]).find((entity) => entity !== undefined);
  const visible = controls.flatMap((control) => {
    const context = controlContext(control, doc, selected);
    return context === undefined ? [] : [context];
  });

  return (
    <FocusZone id={EDITOR_FOCUS_ZONES.inspector} className="editor-inspector">
      {visible.map((context) => (
        <div className="control-row" key={context.control.id}>
          <div className="control-heading">
            <span>{context.control.label}</span>
            <small>{context.scopeLabel}</small>
          </div>
          <ControlWidget context={context} onCommand={onCommand} />
        </div>
      ))}
    </FocusZone>
  );
}

function ControlWidget({ context, onCommand }: { context: ControlContext; onCommand(command: EditorCommand): void }) {
  const { control, targets } = context;
  const set = (value: unknown) => onCommand({ op: 'set', control: control.id, targets, value });
  switch (control.widget.kind) {
    case 'toggle': {
      const value = context.value === true;
      return (
        <button className="toggle-control tap-secondary" type="button" aria-pressed={value} onClick={() => set(!value)}>
          <span className="sr">{control.label}</span>
        </button>
      );
    }
    case 'slider': {
      const value = numberValue(context.value, control.default, control.widget.min);
      return (
        <input
          aria-label={control.label}
          type="range"
          min={control.widget.min}
          max={control.widget.max}
          step={control.widget.step}
          value={value}
          onChange={(event) => set(event.currentTarget.valueAsNumber)}
        />
      );
    }
    case 'count': {
      const value = numberValue(context.value, control.default, control.widget.min);
      return (
        <div className="count-control">
          <button
            className="tap-secondary"
            type="button"
            aria-label={`Decrease ${control.label}`}
            disabled={value <= control.widget.min}
            onClick={() => set(value - 1)}
          >
            −
          </button>
          <output>{value}</output>
          <button
            className="tap-secondary"
            type="button"
            aria-label={`Increase ${control.label}`}
            disabled={value >= control.widget.max}
            onClick={() => set(value + 1)}
          >
            +
          </button>
        </div>
      );
    }
    case 'choice':
      if (control.widget.options.length <= 4) {
        return (
          <div className="choice-segment" role="group" aria-label={control.label}>
            {control.widget.options.map((option) => (
              <button
                className="tap-secondary"
                type="button"
                key={option.value}
                aria-pressed={option.value === context.value}
                onClick={() => set(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      }
      return (
        <select
          aria-label={control.label}
          value={String(context.value ?? control.default)}
          onChange={(event) => set(event.currentTarget.value)}
        >
          {control.widget.options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'color':
      return (
        <input
          aria-label={control.label}
          type="color"
          value={typeof context.value === 'string' ? context.value : String(control.default)}
          onChange={(event) => set(event.currentTarget.value)}
        />
      );
    case 'text':
      return (
        <input
          aria-label={control.label}
          type="text"
          maxLength={control.widget.maxLength}
          value={typeof context.value === 'string' ? context.value : String(control.default)}
          onChange={(event) => set(event.currentTarget.value)}
        />
      );
    default:
      return null;
  }
}

function controlContext(
  control: ControlDecl,
  doc: DesignDoc,
  selected: Entity | undefined,
): ControlContext | undefined {
  if (control.scope === 'global') {
    return {
      control,
      targets: 'global',
      value: doc.globals[control.id] ?? control.default,
      scopeLabel: 'Game',
    };
  }
  if (selected === undefined) return undefined;
  if (control.scope === 'instance') {
    return {
      control,
      targets: [selected.id],
      value: selected.props[control.id] ?? control.default,
      scopeLabel: `This ${selected.prefab}`,
    };
  }
  if (control.scope === 'prefab') {
    const targets = Object.values(doc.entities)
      .filter((entity) => entity.prefab === selected.prefab)
      .map((entity) => entity.id);
    return {
      control,
      targets,
      value: selected.props[control.id] ?? control.default,
      scopeLabel: `All ${selected.prefab}s`,
    };
  }
  const targets = matchingTargets(doc, control.scope.selector);
  return {
    control,
    targets,
    value: selected.props[control.id] ?? control.default,
    scopeLabel: 'Matching',
  };
}

function matchingTargets(
  doc: DesignDoc,
  selector: { prefab?: string; ids?: string[]; where?: Record<string, unknown> },
): string[] {
  return Object.values(doc.entities)
    .filter((entity) => selector.prefab === undefined || entity.prefab === selector.prefab)
    .filter((entity) => selector.ids === undefined || selector.ids.includes(entity.id))
    .filter((entity) =>
      Object.entries(selector.where ?? {}).every(([key, value]) => Object.is(entity.props[key], value)),
    )
    .map((entity) => entity.id);
}

function numberValue(value: unknown, fallback: unknown, minimum: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  return minimum;
}
