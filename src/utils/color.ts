/**
 * Apply an alpha (0–1) to a colour that may be a hex (`#rgb` / `#rrggbb`) OR an
 * `rgb()` / `rgba()` string.
 *
 * Why this exists: the MD3 **dark** theme exposes its surface/text colours as
 * `rgba(…)` strings (e.g. `onSurface = 'rgba(230, 225, 229, 1)'`). The old
 * `color + '15'` hex-suffix trick only works on hex colours — on an rgba string
 * it produces an invalid value that renders fully opaque, destroying contrast
 * (an "active" tint turned into a solid near-white box). Always tint theme
 * colours through this helper instead of string concatenation.
 */
export function withAlpha(color: string, alpha: number): string {
  if (!color) return color;

  const rgb = color.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((s) => s.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (![r, g, b].some(Number.isNaN)) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}
