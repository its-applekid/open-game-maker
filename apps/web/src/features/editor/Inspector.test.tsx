import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignDocSchema, type ControlDecl, type DesignDoc } from '@ogm/contracts';

import { Inspector } from './Inspector';

const skeletonA = 'e_01BX5ZZKBKACTAV9WEVGEMMVRZ';
const skeletonB = 'e_01BX5ZZKBKACTAV9WEVGEMMVS0';

function doc(): DesignDoc {
  return DesignDocSchema.parse({
    schemaVersion: 1,
    globals: { 'world.night': false },
    entities: {
      [skeletonA]: {
        id: skeletonA,
        prefab: 'skeleton',
        level: 'crypt',
        origin: 'build',
        props: { 'enemy.fast': false, 'enemy.kind': 'guard', 'enemy.count': 1 },
      },
      [skeletonB]: {
        id: skeletonB,
        prefab: 'skeleton',
        level: 'crypt',
        origin: 'build',
        props: { 'enemy.fast': false },
      },
    },
  });
}

function control(overrides: Partial<ControlDecl>): ControlDecl {
  return {
    id: 'enemy.fast',
    label: 'Fast',
    scope: 'instance',
    path: '/props/enemy.fast',
    widget: { kind: 'toggle' },
    default: false,
    ...overrides,
  } as ControlDecl;
}

afterEach(cleanup);

describe('Inspector', () => {
  it('labels instance and prefab scopes and targets the correct entities', () => {
    const onCommand = vi.fn();
    render(
      <Inspector
        doc={doc()}
        selectedIds={[skeletonA]}
        controls={[
          control({ id: 'enemy.fast', label: 'This fast', scope: 'instance' }),
          control({ id: 'enemy.alert', label: 'All alert', scope: 'prefab' }),
        ]}
        onCommand={onCommand}
      />,
    );

    expect(screen.getByText('This skeleton')).toBeVisible();
    expect(screen.getByText('All skeletons')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'All alert' }));

    expect(onCommand).toHaveBeenCalledWith({
      op: 'set',
      control: 'enemy.alert',
      targets: [skeletonA, skeletonB],
      value: true,
    });
  });

  it('uses segmented buttons for four choices and a select for five', () => {
    render(
      <Inspector
        doc={doc()}
        selectedIds={[skeletonA]}
        controls={[
          control({
            id: 'enemy.kind',
            label: 'Kind',
            widget: {
              kind: 'choice',
              options: ['guard', 'archer', 'mage', 'knight'].map((value) => ({ value, label: value })),
            },
          }),
          control({
            id: 'enemy.voice',
            label: 'Voice',
            widget: {
              kind: 'choice',
              options: ['one', 'two', 'three', 'four', 'five'].map((value) => ({ value, label: value })),
            },
          }),
        ]}
        onCommand={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Kind' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Voice' })).toBeVisible();
  });

  it('does not emit an invalid count below its boundary', () => {
    const onCommand = vi.fn();
    render(
      <Inspector
        doc={doc()}
        selectedIds={[skeletonA]}
        controls={[
          control({
            id: 'enemy.count',
            label: 'Count',
            widget: { kind: 'count', min: 1, max: 3, semantics: 'instances' },
          }),
        ]}
        onCommand={onCommand}
      />,
    );

    expect(screen.getByRole('button', { name: 'Decrease Count' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Count' }));
    expect(onCommand).not.toHaveBeenCalled();
  });
});
