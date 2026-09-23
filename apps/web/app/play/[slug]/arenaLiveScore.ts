/**
 * Shared by GamePlayer and CodeGamePlayer: how often, at most, a live score
 * change during arena play is mirrored to the server (reportArenaScore).
 * Score can change many times a second (e.g. a fast catch-game combo) —
 * this keeps that from turning into a server action call per tick while
 * still reading as "live" on the host's big screen.
 */
export const ARENA_LIVE_SCORE_THROTTLE_MS = 1200;
