import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const TRUST_DELTAS = {
  ACTION_VERIFIED: 5,
  ACTION_REJECTED: -20,
  CORRECT_VERIFICATION: 3,
  WRONG_VERIFICATION: -10,
  CHECKPOINT_WIN: 25,
  INACTIVITY_DECAY: -1,
} as const;

export async function adjustTrust(
  agentId: string,
  delta: number,
  reason: string
): Promise<number> {
  // Update agent trust score (clamped 0-100)
  await db
    .update(schema.agents)
    .set({
      trustScore: sql`GREATEST(0, LEAST(100, trust_score + ${delta}))`,
      lastActive: new Date(),
    })
    .where(eq(schema.agents.id, agentId));

  // Log the event
  await db.insert(schema.trustEvents).values({
    id: nanoid(),
    agentId,
    delta,
    reason,
  });

  // Return new score
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  return agent?.trustScore ?? 0;
}

export function getTrustRole(score: number): string {
  if (score >= 90) return 'architect';
  if (score >= 70) return 'commander';
  if (score >= 50) return 'operative';
  if (score >= 30) return 'scout';
  return 'unverified';
}

export function canPerformAction(score: number, action: string): boolean {
  const role = getTrustRole(score);

  switch (action) {
    case 'create_swarm':
      return role === 'architect' || role === 'commander';
    case 'capture':
    case 'link':
    case 'discover':
      return ['architect', 'commander', 'operative'].includes(role);
    case 'verify':
      return role !== 'unverified';
    default:
      return false;
  }
}
