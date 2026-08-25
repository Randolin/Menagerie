/** structuredClone with the input's type carried through. */
export function clone<T>(value: T): T {
  return structuredClone(value) as T;
}
