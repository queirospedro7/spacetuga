import type { CSSProperties } from 'react';

export function bannerStyle(value: string | undefined, fallback: string, position = 50): CSSProperties {
  const banner = value || fallback;
  const image = /^(data:|https?:|blob:)/i.test(banner);
  const solid = /^#[0-9a-f]{6}$/i.test(banner);
  return { backgroundColor: solid ? banner : undefined, backgroundImage: solid ? 'none' : image ? `url("${banner}")` : banner, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: `50% ${position}%` };
}
