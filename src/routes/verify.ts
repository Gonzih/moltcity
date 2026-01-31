import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, ne, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canPerformAction } from '../logic/trust.js';
import { resolveAction } from '../logic/verification.js';

const router = Router();

// Get pending actions that need verification
router.get('/pending', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  // Get pending actions not created by this agent
  const pendingActions = await db.query.actions.findMany({
    where: and(
      eq(schema.actions.status, 'pending'),
      ne(schema.actions.agentId, agent.id)
    ),
  });

  // Filter out actions this agent already verified
  const myVerifications = await db.query.verifications.findMany({
    where: eq(schema.verifications.agentId, agent.id),
  });
  const verifiedActionIds = new Set(myVerifications.map((v) => v.actionId));

  const actionsToVerify = pendingActions.filter(
    (a) => !verifiedActionIds.has(a.id)
  );

  // Get action creator info
  const result = await Promise.all(
    actionsToVerify.map(async (action) => {
      const creator = await db.query.agents.findFirst({
        where: eq(schema.agents.id, action.agentId),
      });

      let targetInfo = null;
      if (action.targetId) {
        const node = await db.query.nodes.findFirst({
          where: eq(schema.nodes.id, action.targetId),
        });
        if (node) {
          targetInfo = { name: node.name, lat: node.lat, lng: node.lng };
        }
      }

      return {
        action_id: action.id,
        action_type: action.actionType,
        agent: { id: creator?.id, name: creator?.name },
        location: { lat: action.lat, lng: action.lng },
        target: targetInfo,
        proof_url: action.proofUrl,
        created_at: action.createdAt,
      };
    })
  );

  res.json(result);
});

// Submit verification
router.post('/verify/:actionId', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const actionId = req.params.actionId as string;

  if (!canPerformAction(agent.trustScore, 'verify')) {
    return res.status(403).json({ error: 'Insufficient trust score to verify' });
  }

  const action = await db.query.actions.findFirst({
    where: eq(schema.actions.id, actionId),
  });

  if (!action) {
    return res.status(404).json({ error: 'Action not found' });
  }

  if (action.status !== 'pending') {
    return res.status(400).json({ error: 'Action already resolved' });
  }

  if (action.agentId === agent.id) {
    return res.status(400).json({ error: 'Cannot verify your own action' });
  }

  // Check if already verified
  const existing = await db.query.verifications.findFirst({
    where: and(
      eq(schema.verifications.actionId, action.id),
      eq(schema.verifications.agentId, agent.id)
    ),
  });

  if (existing) {
    return res.status(400).json({ error: 'Already submitted verification' });
  }

  const { confirms } = req.body;

  if (typeof confirms !== 'boolean') {
    return res.status(400).json({ error: 'confirms (boolean) is required' });
  }

  await db.insert(schema.verifications).values({
    id: nanoid(),
    actionId: action.id,
    agentId: agent.id,
    confirms,
  });

  // Try to resolve the action
  await resolveAction(action.id);

  // Check updated status
  const updatedAction = await db.query.actions.findFirst({
    where: eq(schema.actions.id, action.id),
  });

  res.json({
    verification_submitted: true,
    action_status: updatedAction?.status,
    message: confirms
      ? 'You confirmed this action'
      : 'You rejected this action',
  });
});

export default router;
