export function applyAccentColor(value: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#0A84FF';
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const normalized = rgb.map((channel) => channel / 255);
  const linear = normalized.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const foreground = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '0 0% 0%' : '0 0% 100%';
  const max = Math.max(...normalized);
  const min = Math.min(...normalized);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === normalized[0]) hue = ((normalized[1] - normalized[2]) / delta) % 6;
    else if (max === normalized[1]) hue = (normalized[2] - normalized[0]) / delta + 2;
    else hue = (normalized[0] - normalized[1]) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  const saturation = max === min ? 0 : Math.round(delta / (1 - Math.abs(2 * ((max + min) / 2) - 1)) * 100);
  const lightness = Math.round(((max + min) / 2) * 100);
  const primary = `${hue} ${saturation}% ${lightness}%`;
  const root = document.documentElement;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-foreground', foreground);
  root.style.setProperty('--ring', primary);
  root.style.setProperty('--sidebar-primary', primary);
  root.style.setProperty('--sidebar-primary-foreground', foreground);
  const contrastText = (dark: boolean) => {
    const background = dark ? 0.025 : 0.82;
    const target = dark ? 255 : 0;
    for (let step = 0; step <= 100; step++) {
      const channels = rgb.map((channel) => Math.round(channel + (target - channel) * step / 100));
      const converted = channels.map((channel) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      const textLuminance = 0.2126 * converted[0] + 0.7152 * converted[1] + 0.0722 * converted[2];
      const contrast = (Math.max(textLuminance, background) + 0.05) / (Math.min(textLuminance, background) + 0.05);
      if (contrast >= 4.5) return channels.join(' ');
    }
    return `${target} ${target} ${target}`;
  };
  root.style.setProperty('--primary-text-light', contrastText(false));
  root.style.setProperty('--primary-text-dark', contrastText(true));
}
