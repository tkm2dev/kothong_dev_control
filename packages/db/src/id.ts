import { v7 as uuidv7 } from 'uuid';

/**
 * Primary keys are UUID v7, decided in ADR 0003.
 *
 * v7 is time-ordered, so inserts stay near the end of the index instead of
 * scattering across it the way v4 does, while remaining a native `uuid` column.
 */
export function newId(): string {
  return uuidv7();
}
