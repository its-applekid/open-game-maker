import type { ControlDecl } from '@ogm/contracts/game';

import type { CheckContext, CheckResult, OpenOptions, Session } from '../types.js';

export type Outcome = Omit<CheckResult, 'id' | 'name'>;

export const pass = (detail: string, artifacts?: string[]): Outcome => ({ status: 'pass', detail, artifacts });
export const fail = (detail: string, artifacts?: string[]): Outcome => ({ status: 'fail', detail, artifacts });
export const unchecked = (detail: string): Outcome => ({ status: 'unchecked', detail });

/**
 * Opens a session seeded with 1 (every check is deterministic from there) and always closes it.
 * A published build refuses `test.*`, so it is not seeded.
 */
export async function withSession<T>(
  ctx: CheckContext,
  options: Partial<OpenOptions>,
  run: (session: Session) => Promise<T>,
): Promise<T> {
  const session = await ctx.open(options);
  try {
    if (options.build !== 'published') await session.setSeed(1);
    return await run(session);
  } finally {
    await session.close();
  }
}

/** The values a control must accept: slider/count min, max and default; both toggles; every choice. */
export function controlValues(control: ControlDecl): unknown[] {
  const widget = control.widget;
  switch (widget.kind) {
    case 'slider':
    case 'count':
      return [widget.min, widget.max, control.default];
    case 'toggle':
      return [true, false, control.default];
    case 'choice':
      return [...widget.options.map((option) => option.value), control.default];
    default:
      return [control.default];
  }
}

/** The design pointers a control writes: its path for `global`, else its path under each matching entity. */
export function controlTargets(control: ControlDecl, design: Record<string, unknown>): string[] {
  if (control.scope === 'global') return [control.path];
  const entities = (design.entities ?? {}) as Record<string, { prefab?: unknown }>;
  const prefab = typeof control.scope === 'object' ? control.scope.selector.prefab : undefined;
  return Object.entries(entities)
    .filter(([, entity]) => prefab === undefined || entity.prefab === prefab)
    .map(([id]) => `/entities/${id.replaceAll('~', '~0').replaceAll('/', '~1')}${control.path}`);
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
