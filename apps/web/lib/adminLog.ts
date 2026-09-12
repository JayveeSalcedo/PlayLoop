import { schema, type Db, type Tx } from "@playloop/db";

export type AdminAction =
  | "game.approve"
  | "game.reject"
  | "campaign.fund"
  | "profile.suspend"
  | "profile.unsuspend"
  | "reward.create"
  | "reward.update"
  | "reward.top_up"
  | "reward.activate"
  | "reward.deactivate";

export interface AdminActionRecord {
  actorProfileId: string;
  action: AdminAction;
  targetType: "game" | "campaign" | "profile" | "reward";
  targetId: string;
  /** One line, written for whoever reads the activity list months from now. */
  summary: string;
  details?: Record<string, unknown>;
}

/**
 * Records an admin action.
 *
 * Takes `db` *or* a transaction, so an action that already runs inside one can
 * write its audit row atomically with the change it describes — a log that can
 * disagree with what actually happened is worse than none. Actions that aren't
 * transactional pass the plain client.
 */
export async function recordAdminAction(client: Db | Tx, entry: AdminActionRecord): Promise<void> {
  await client.insert(schema.adminActions).values({
    actorProfileId: entry.actorProfileId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    details: entry.details ?? {},
  });
}
