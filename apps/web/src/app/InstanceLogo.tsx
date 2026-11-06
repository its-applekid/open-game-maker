import type { ImgHTMLAttributes } from 'react';

type InstanceLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  defaultSource: string;
};

const SUPPORTED_LOGO_PATH = /\.(?:png|webp|svg)$/i;

export function resolveInstanceLogoSource(
  defaultSource: string,
  configuredSource = import.meta.env.VITE_INSTANCE_LOGO_URL,
): string {
  const source = configuredSource?.trim();
  if (!source) return defaultSource;

  const rootRelative = source.startsWith('/') && !source.startsWith('//');
  let url: URL;
  try {
    url = rootRelative ? new URL(source, 'https://instance.invalid') : new URL(source);
  } catch {
    throw new Error('VITE_INSTANCE_LOGO_URL must be a root-relative path or HTTPS URL');
  }

  if ((!rootRelative && url.protocol !== 'https:') || !SUPPORTED_LOGO_PATH.test(url.pathname)) {
    throw new Error('VITE_INSTANCE_LOGO_URL must point to a PNG, WebP, or SVG over HTTPS or a root-relative path');
  }

  return source;
}

export function InstanceLogo({ defaultSource, ...imageProps }: InstanceLogoProps) {
  const source = resolveInstanceLogoSource(defaultSource);
  return <img {...imageProps} src={source} data-instance-logo={source === defaultSource ? 'default' : 'custom'} />;
}
