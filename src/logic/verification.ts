import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { adjustTrust, TRUST_DELTAS } from './trust.js';

const MIN_VERIFICATIONS = 3;

export async function resolveAction(actionId: string): Promise<void> {
  const verifications = await db.query.verifications.findMany({
    where: eq(schema.verifications.actionId, actionId),
  });

  if (verifications.length < MIN_VERIFICATIONS) {
    return; // Not enough votes yet
  }

  const action = await db.query.actions.findFirst({
    where: eq(schema.actions.id, actionId),
  });

  if (!action || action.status !== 'pending') {
    return; // Already resolved
  }

  const confirms = verifications.filter((v) => v.confirms).length;
  const denies = verifications.length - confirms;

  if (confirms > denies) {
    // Action verified
    await db
      .update(schema.actions)
      .set({ status: 'verified' })
      .where(eq(schema.actions.id, actionId));

    await adjustTrust(action.agentId, TRUST_DELTAS.ACTION_VERIFIED, 'action_verified');
    await executeAction(action);

    // Reward correct verifiers
    for (const v of verifications.filter((v) => v.confirms)) {
      await adjustTrust(v.agentId, TRUST_DELTAS.CORRECT_VERIFICATION, 'correct_verification');
    }

    // Penalize wrong verifiers
    for (const v of verifications.filter((v) => !v.confirms)) {
      await adjustTrust(v.agentId, TRUST_DELTAS.WRONG_VERIFICATION, 'wrong_verification');
    }
  } else {
    // Action rejected
    await db
      .update(schema.actions)
      .set({ status: 'rejected' })
      .where(eq(schema.actions.id, actionId));

    await adjustTrust(action.agentId, TRUST_DELTAS.ACTION_REJECTED, 'action_rejected');

    // Reward correct verifiers (deniers)
    for (const v of verifications.filter((v) => !v.confirms)) {
      await adjustTrust(v.agentId, TRUST_DELTAS.CORRECT_VERIFICATION, 'correct_verification');
    }

    // Penalize wrong verifiers (confirmers)
    for (const v of verifications.filter((v) => v.confirms)) {
      await adjustTrust(v.agentId, TRUST_DELTAS.WRONG_VERIFICATION, 'wrong_verification');
    }
  }
}

async function executeAction(action: typeof schema.actions.$inferSelect): Promise<void> {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, action.agentId),
  });

  switch (action.actionType) {
    case 'discover':
      // Node already created in pending state, just confirm it
      break;

    case 'capture':
      if (action.targetId && agent?.swarmId) {
        await db
          .update(schema.nodes)
          .set({ controlledBy: agent.swarmId })
          .where(eq(schema.nodes.id, action.targetId));
      }
      break;

    case 'link':
      // Link already created in pending state, now active
      break;
  }
}
