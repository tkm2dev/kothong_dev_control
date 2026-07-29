/**
 * Design tokens.
 *
 * `docs/UX_FLOWS.md` section 2 is the source of truth. The values here mirror
 * it, and `design-tokens.test.ts` recomputes every contrast ratio in that
 * document's table and asserts it still meets the stated threshold.
 *
 * That test is the point. Changing a colour without re-measuring will fail CI,
 * which is what AC-23 requires.
 */

export const TOKENS = {
  // Backgrounds
  bgCanvas: '#F5F0E6',
  bgSurface: '#FFFDF8',
  bgSidebar: '#292A20',
  bgSidebarHover: '#3A392B',

  // Text
  textPrimary: '#2E2B24',
  textSecondary: '#736D62',
  textOnDark: '#F8F3E8',

  // Borders
  border: '#DDD5C8',
  borderStrong: '#9E8863',
  focus: '#2E2B24',

  // Action surfaces. Only ever used as a background, paired with textPrimary.
  accent: '#D79A1E',
  accentHover: '#E0A62E',

  // Text and icon colours on light backgrounds
  accentText: '#8F6614',
  successText: '#64725C',
  warningText: '#916520',
  dangerText: '#A84E3F',
  infoText: '#617076',
} as const;

export type TokenName = keyof typeof TOKENS;

/** Relative luminance per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Contrast ratio between two colours, always >= 1. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
