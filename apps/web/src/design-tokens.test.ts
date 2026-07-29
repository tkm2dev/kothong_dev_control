import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS, contrastRatio, type TokenName } from './design-tokens.ts';

const UX_DOC = fileURLToPath(new URL('../../../docs/UX_FLOWS.md', import.meta.url));

/** Every `--color-*: #RRGGBB;` declaration in the document's token block. */
function documentedTokens(): Map<string, string> {
  const rows = readFileSync(UX_DOC, 'utf8').matchAll(
    /^\s*--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6});/gm,
  );
  return new Map([...rows].map((m) => [m[1] as string, (m[2] as string).toUpperCase()]));
}

/** `--color-bg-canvas` -> `bgCanvas` */
function toCamel(cssName: string): string {
  return cssName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The contrast pairs the document commits to, with the threshold each one is
 * held to. 4.5 is AA for normal text; 3.0 is WCAG 1.4.11 for non-text.
 */
const PAIRS: Array<[TokenName, TokenName, number, string]> = [
  ['textPrimary', 'bgCanvas', 4.5, 'primary text on canvas'],
  ['textPrimary', 'bgSurface', 4.5, 'primary text on surface'],
  ['textSecondary', 'bgCanvas', 4.5, 'secondary text on canvas'],
  ['textOnDark', 'bgSidebar', 4.5, 'text on sidebar'],
  ['textOnDark', 'bgSidebarHover', 4.5, 'text on sidebar hover'],
  ['textPrimary', 'accent', 4.5, 'text on the primary button'],
  ['textPrimary', 'accentHover', 4.5, 'text on the primary button while hovered'],
  ['accentText', 'bgCanvas', 4.5, 'amber text and icons on canvas'],
  ['successText', 'bgCanvas', 4.5, 'success text and icons on canvas'],
  ['warningText', 'bgCanvas', 4.5, 'warning text and icons on canvas'],
  ['dangerText', 'bgCanvas', 4.5, 'danger text and icons on canvas'],
  ['infoText', 'bgCanvas', 4.5, 'info text and icons on canvas'],
  ['borderStrong', 'bgCanvas', 3.0, 'meaningful control boundaries'],
  ['focus', 'bgCanvas', 3.0, 'focus ring'],
];

describe('design tokens', () => {
  const documented = documentedTokens();

  it('finds tokens in the documentation', () => {
    expect(documented.size).toBeGreaterThan(0);
  });

  it('matches every value declared in docs/UX_FLOWS.md', () => {
    const mismatched: string[] = [];
    for (const [cssName, docValue] of documented) {
      const key = toCamel(cssName) as TokenName;
      const codeValue = TOKENS[key];
      if (codeValue === undefined) {
        mismatched.push(`--color-${cssName} is documented but missing from the code`);
      } else if (codeValue.toUpperCase() !== docValue) {
        mismatched.push(`--color-${cssName}: doc ${docValue}, code ${codeValue}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it.each(PAIRS)('%s on %s meets %s:1 — %s', (fg, bg, threshold) => {
    const ratio = contrastRatio(TOKENS[fg], TOKENS[bg]);
    expect(
      Number(ratio.toFixed(2)),
      `${fg} on ${bg} is ${ratio.toFixed(2)}:1, below the required ${threshold}:1`,
    ).toBeGreaterThanOrEqual(threshold);
  });

  it('keeps accent unusable as text on light backgrounds', () => {
    // accent is a fill. If someone ever "fixes" it into a text colour this
    // records why that is wrong rather than leaving it as folklore.
    expect(contrastRatio(TOKENS.accent, TOKENS.bgCanvas)).toBeLessThan(3);
  });

  it('brightens rather than darkens the primary button on hover', () => {
    // Darkening drops contrast with the dark label below 4.5:1.
    expect(contrastRatio(TOKENS.textPrimary, TOKENS.accentHover)).toBeGreaterThan(
      contrastRatio(TOKENS.textPrimary, TOKENS.accent),
    );
  });
});
