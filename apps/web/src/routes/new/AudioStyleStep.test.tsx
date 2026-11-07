import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioStyleStep } from './AudioStyleStep';
import type { AudioStyleFamily } from './catalog';

const families: AudioStyleFamily[] = [
  {
    id: 'chiptune',
    label: 'Chiptune',
    styles: [
      {
        id: 'chiptune-playful',
        label: 'Chiptune · Playful',
        style: 'chiptune',
        mood: 'playful',
        sampleUrl: '/api/catalog/audio-styles/chiptune-playful/sample',
      },
      {
        id: 'chiptune-energetic',
        label: 'Chiptune · Energetic',
        style: 'chiptune',
        mood: 'energetic',
        sampleUrl: '/api/catalog/audio-styles/chiptune-energetic/sample',
      },
    ],
  },
  {
    id: 'ambient',
    label: 'Ambient',
    styles: [
      {
        id: 'ambient-calm',
        label: 'Ambient · Calm',
        style: 'ambient',
        mood: 'calm',
        sampleUrl: '/api/catalog/audio-styles/ambient-calm/sample',
      },
    ],
  },
];

function renderStep(overrides: Partial<Parameters<typeof AudioStyleStep>[0]> = {}) {
  const onSelect = vi.fn();
  const onOtherChange = vi.fn();
  render(
    <AudioStyleStep
      families={families}
      selected={[]}
      other={undefined}
      full={false}
      onFull={vi.fn()}
      onOtherChange={onOtherChange}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect, onOtherChange };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AudioStyleStep', () => {
  it('shows family tiles first and opens the moods within a family', () => {
    renderStep();
    expect(screen.getByRole('button', { name: 'Chiptune' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ambient' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Chiptune' }));
    expect(screen.getByRole('group', { name: 'Chiptune moods' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chiptune · Playful' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chiptune · Energetic' })).toBeVisible();
  });

  it('opens a single-mood family straight into its sample', () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Ambient' }));
    expect(screen.getByRole('region', { name: 'Ambient · Calm' })).toBeVisible();
  });

  it('plays the sample for a style and selects it as the direction', () => {
    const { onSelect } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Chiptune' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chiptune · Playful' }));
    expect(screen.getByRole('region', { name: 'Chiptune · Playful' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Play Chiptune · Playful' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Select Chiptune · Playful' }));
    expect(onSelect).toHaveBeenCalledWith('chiptune-playful');
    // Selecting returns to the families so the next pick starts from the top, like the Style step.
    expect(screen.getByRole('button', { name: 'Chiptune' })).toBeVisible();
  });

  it('marks a selected style and offers the Other direction on the family screen', () => {
    renderStep({ selected: ['chiptune-energetic'] });
    expect(screen.getByRole('button', { name: 'Other' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Chiptune' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chiptune · Energetic' }));
    expect(screen.getByRole('button', { name: 'Select Chiptune · Energetic' })).toHaveAttribute('aria-pressed', 'true');
  });
});
