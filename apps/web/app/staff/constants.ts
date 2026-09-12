/**
 * Shared by the server actions and the page query. Lives outside actions.ts
 * because a "use server" module may only export async functions.
 */

/** How long after taking a voucher staff can still undo it. Always enforced DB-side. */
export const UNDO_WINDOW_MINUTES = 10;
