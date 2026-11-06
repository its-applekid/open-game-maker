import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstanceLogo, resolveInstanceLogoSource } from './InstanceLogo';

describe('InstanceLogo', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the surface-specific default when instance branding is unset', () => {
    vi.stubEnv('VITE_INSTANCE_LOGO_URL', '');

    render(<InstanceLogo defaultSource="/art/logo.webp" alt="Open Game Maker 2000" />);

    expect(screen.getByRole('img', { name: 'Open Game Maker 2000' })).toHaveAttribute('src', '/art/logo.webp');
  });

  it('uses one configured logo on every surface', () => {
    vi.stubEnv('VITE_INSTANCE_LOGO_URL', '/branding/family-logo.svg');

    const { rerender } = render(<InstanceLogo defaultSource="/art/logo.webp" alt="Title logo" />);
    expect(screen.getByRole('img', { name: 'Title logo' })).toHaveAttribute('src', '/branding/family-logo.svg');

    rerender(<InstanceLogo defaultSource="/art/gm.webp" alt="App logo" />);
    expect(screen.getByRole('img', { name: 'App logo' })).toHaveAttribute('src', '/branding/family-logo.svg');
  });

  it.each(['/branding/logo.jpg', 'http://example.test/logo.png', 'javascript:logo.svg'])(
    'refuses an unsafe or unsupported configured source: %s',
    (configured) => {
      expect(() => resolveInstanceLogoSource('/art/logo.webp', configured)).toThrow(/VITE_INSTANCE_LOGO_URL/);
    },
  );
});
