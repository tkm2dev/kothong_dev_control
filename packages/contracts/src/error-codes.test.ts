import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_CODE_LIST, httpStatusFor, isErrorCode } from './error-codes.ts';

const CATALOGUE = fileURLToPath(new URL('../../../docs/ERROR_CODES.md', import.meta.url));

/**
 * Parses the code and HTTP status out of the catalogue's markdown tables.
 * Rows look like: | `UNAUTHENTICATED` | 401 | ... |
 */
function parseCatalogue(): Map<string, number> {
  const rows = readFileSync(CATALOGUE, 'utf8').matchAll(
    /^\|\s*`([A-Z_]+)`\s*\|\s*(\d{3})\s*\|/gm,
  );
  return new Map([...rows].map((m) => [m[1] as string, Number(m[2])]));
}

describe('error code catalogue', () => {
  const documented = parseCatalogue();

  it('finds codes in the documentation', () => {
    // Guards against a silent pass if the markdown format ever changes and the
    // parser starts matching nothing.
    expect(documented.size).toBeGreaterThan(0);
  });

  it('documents every code that exists in the source', () => {
    const missing = ERROR_CODE_LIST.filter((code) => !documented.has(code));
    expect(missing).toEqual([]);
  });

  it('implements every code that the documentation lists', () => {
    const missing = [...documented.keys()].filter((code) => !isErrorCode(code));
    expect(missing).toEqual([]);
  });

  it('uses the same HTTP status as the documentation', () => {
    const mismatched: string[] = [];
    for (const [code, status] of documented) {
      if (!isErrorCode(code)) continue;
      const implemented = httpStatusFor(code);
      if (implemented !== status) {
        mismatched.push(`${code}: doc ${status}, code ${implemented}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('reports unknown strings as not being error codes', () => {
    expect(isErrorCode('NOT_A_REAL_CODE')).toBe(false);
  });

  it('keeps NOT_FOUND covering the cross-tenant case', () => {
    // The Denied Response Policy requires a resource the caller may not see to
    // answer 404 rather than 403. If these ever diverge, that policy has been
    // broken somewhere.
    expect(ERROR_CODES.NOT_FOUND).toBe(404);
    expect(ERROR_CODES.TENANT_BOUNDARY_VIOLATION).toBe(404);
  });
});
