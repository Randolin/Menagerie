// Garbage-collection policy, shared by server sweep and UI copy so the
// warning text can never drift from what the server actually does.
export const GC_EMPTY_MS = 7 * 24 * 60 * 60 * 1000; // never-populated profiles
export const GC_IDLE_MS = 365 * 24 * 60 * 60 * 1000; // no edit AND no view

export const GC_EMPTY_HUMAN = '7 days';
export const GC_IDLE_HUMAN = '12 months';
