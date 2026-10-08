import { all, batch, newId, now, stmt } from './db';

export type NotificationType =
  | 'comment_reply'
  | 'new_comment_post'
  | 'new_comment_proposal'
  | 'proposal_status_mine'
  | 'proposal_status_supported'
  | 'town_hall_live'
  | 'town_hall_soon'
  | 'question_answered'
  | 'event_reminder'
  | 'team_thread'
  | 'team_comment'
  | 'team_proposal'
  | 'team_report'
  | 'team_question'
  | 'team_rsvp'
  | 'sign_up'
  | 'account_approved'
  | 'account_declined';

const insert = (
  userId: string,
  type: NotificationType,
  actorId: string | null,
  targetType: string,
  targetId: string,
  title: string,
  extra = '',
) =>
  stmt(
    'INSERT INTO notification (id, user_id, type, actor_id, target_type, target_id, title, extra, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    newId(),
    userId,
    type,
    actorId,
    targetType,
    targetId,
    title,
    extra,
    now(),
  );

export async function notify(
  userIds: string[],
  type: NotificationType,
  actorId: string | null,
  targetType: string,
  targetId: string,
  title: string,
  extra = '',
) {
  const unique = [...new Set(userIds)].filter((u) => u && u !== actorId);
  await batch(unique.map((u) => insert(u, type, actorId, targetType, targetId, title, extra)));
}

/** Tells every team member (except the actor) what happened, for the team's activity feed. */
export async function notifyTeam(
  type: NotificationType,
  actorId: string,
  targetType: string,
  targetId: string,
  title: string,
) {
  const team = await all<{ id: string }>(
    "SELECT id FROM \"user\" WHERE role IN ('admin', 'superadmin') AND closedAt IS NULL",
  );
  await notify(
    team.map((t) => t.id),
    type,
    actorId,
    targetType,
    targetId,
    title,
  );
}
