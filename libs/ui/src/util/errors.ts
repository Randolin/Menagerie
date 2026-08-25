/** Human-readable message from any thrown value. */
export function errorText(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  return err == null ? fallback : String(err);
}
