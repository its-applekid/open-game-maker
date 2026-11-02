import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CatalogFamily } from './catalog';
import { StyleStep } from './StyleStep';

const showcase = {
  tileVideoUrl: '/showcase/tiles.mp4',
  sheetVideoUrl: '/showcase/sheets.mp4',
  stops: [
    {
      id: 'fantasy',
      label: 'Fantasy',
      startSeconds: 0,
      tileFallbackUrl: '/showcase/fantasy-tile.gif',
      sheetFallbackUrl: '/showcase/fantasy-sheet.gif',
    },
    {
      id: 'modern-zombie',
      label: 'Modern zombie',
      startSeconds: 7.5,
      tileFallbackUrl: '/showcase/zombie-tile.gif',
      sheetFallbackUrl: '/showcase/zombie-sheet.gif',
    },
  ],
};

const families: CatalogFamily[] = [
  family('chunky-low-poly', 'Chunky low poly', [set('chunky', 'Chunky set')]),
  family('pixel-art', 'Pixel art', [set('pixel-town', 'Pixel Town')]),
  family('flat-cartoon', 'Flat cartoon', []),
  family('isometric-2d', 'Isometric 2D', [
    { ...set('smallscaleint', 'SmallScaleInt'), pickerFamilies: ['pixel-art'], showcase },
  ]),
  family('sketch', 'Sketch', []),
];

afterEach(cleanup);

function family(id: string, label: string, sets: CatalogFamily['sets']): CatalogFamily {
  return { id, label, views: ['iso'], creationChoice: true, packs: [], sets };
}

function set(id: string, label: string): CatalogFamily['sets'][number] {
  return {
    id,
    label,
    pickerFamilies: [],
    vendors: ['fixture'],
    traits: {},
    packs: [{ id: `${id}-pack`, name: `${label} pack`, thumbnailUrl: `/${id}.png` }],
  };
}

function renderStep(onSelect = vi.fn()) {
  render(
    <StyleStep
      families={families}
      selected={[]}
      other={undefined}
      full={false}
      onFull={vi.fn()}
      onOtherChange={vi.fn()}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

describe('StyleStep', () => {
  it('starts with representative family icons and no set tiles', () => {
    renderStep();

    for (const label of ['Chunky low poly', 'Pixel art', 'Flat cartoon', 'Isometric', 'Sketch', 'Other']) {
      expect(screen.getByRole('button', { name: label })).toBeVisible();
    }
    expect(screen.queryByText('SmallScaleInt')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /pack preview/i })).not.toBeInTheDocument();
  });

  it('opens an aliased set from Pixel art, restores grid focus, and selects from detail', () => {
    const onSelect = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Pixel art' }));

    expect(screen.getByRole('button', { name: 'Pixel Town' })).toBeVisible();
    const smallscaleint = screen.getByRole('button', { name: 'SmallScaleInt' });
    fireEvent.click(smallscaleint);
    expect(screen.getByRole('heading', { name: 'SmallScaleInt' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Pixel art sets' }));
    expect(screen.getByRole('button', { name: 'SmallScaleInt' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'SmallScaleInt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select SmallScaleInt' }));
    expect(onSelect).toHaveBeenCalledWith('smallscaleint');
    expect(screen.getByRole('button', { name: 'Pixel art' })).toBeVisible();
  });

  it('opens a single-set family directly and wraps controls and arrow keys', () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Isometric' }));
    expect(screen.getByRole('heading', { name: 'SmallScaleInt' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next set' }));
    expect(screen.getByRole('heading', { name: 'SmallScaleInt' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: 'SmallScaleInt' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to styles' }));
    expect(screen.getByRole('button', { name: 'Isometric' })).toHaveFocus();
  });

  it('renders inline looping media and seeks and synchronizes both tracks', () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Isometric' }));
    const tile = screen.getByLabelText('Diorama preview') as HTMLVideoElement;
    const sheet = screen.getByLabelText('Sprite sheets preview') as HTMLVideoElement;

    expect(tile).toHaveAttribute('playsinline');
    expect(tile.loop).toBe(true);
    expect(tile.muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Modern zombie' }));
    expect(tile.currentTime).toBe(7.5);
    expect(sheet.currentTime).toBe(7.5);

    tile.currentTime = 9;
    sheet.currentTime = 7.5;
    fireEvent.timeUpdate(tile);
    expect(sheet.currentTime).toBe(9);
    expect(screen.getByRole('img', { name: 'Modern zombie diorama fallback' })).toHaveAttribute(
      'src',
      '/showcase/zombie-tile.gif',
    );
  });

  it('cycles through a multi-set family with Previous, Next, and keyboard wrap', () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Pixel art' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pixel Town' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous set' }));
    expect(screen.getByRole('heading', { name: 'SmallScaleInt' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: 'Pixel Town' })).toBeVisible();
  });
});
