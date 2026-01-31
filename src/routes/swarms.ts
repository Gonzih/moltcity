import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canPerformAction, getTrustRole } from '../logic/trust.js';

const router = Router();

// List all swarms (public info for joining)
router.get('/', authMiddleware, async (req, res) => {
  const swarms = await db.query.swarms.findMany();

  const swarmsWithStats = await Promise.all(
    swarms.map(async (s) => {
      const members = await db.query.agents.findMany({
        where: eq(schema.agents.swarmId, s.id),
      });
      const nodes = await db.query.nodes.findMany({
        where: eq(schema.nodes.controlledBy, s.id),
      });
      const fields = await db.query.fields.findMany({
        where: eq(schema.fields.swarmId, s.id),
      });

      const totalInfluence = fields.reduce((sum, f) => sum + f.influence, 0);
      const avgTrust = members.length
        ? Math.round(members.reduce((sum, m) => sum + m.trustScore, 0) / members.length)
        : 0;

      return {
        id: s.id,
        name: s.name,
        color: s.color,
        description: s.description,
        is_open: s.isOpen,
        min_trust_to_join: s.minTrustToJoin,
        member_count: members.length,
        node_count: nodes.length,
        field_count: fields.length,
        influence: totalInfluence,
        avg_trust: avgTrust,
        created_at: s.createdAt,
      };
    })
  );

  res.json(swarmsWithStats);
});

// Get swarm details with members
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const swarmId = req.params.id as string;

  const swarm = await db.query.swarms.findFirst({
    where: eq(schema.swarms.id, swarmId),
  });

  if (!swarm) {
    return res.status(404).json({ error: 'Swarm not found' });
  }

  const members = await db.query.agents.findMany({
    where: eq(schema.agents.swarmId, swarmId),
    orderBy: desc(schema.agents.trustScore),
  });

  const nodes = await db.query.nodes.findMany({
    where: eq(schema.nodes.controlledBy, swarmId),
  });

  const fields = await db.query.fields.findMany({
    where: eq(schema.fields.swarmId, swarmId),
  });

  res.json({
    id: swarm.id,
    name: swarm.name,
    color: swarm.color,
    description: swarm.description,
    is_open: swarm.isOpen,
    min_trust_to_join: swarm.minTrustToJoin,
    created_by: swarm.createdBy,
    created_at: swarm.createdAt,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      trust_score: m.trustScore,
      role: getTrustRole(m.trustScore),
    })),
    node_count: nodes.length,
    field_count: fields.length,
    influence: fields.reduce((sum, f) => sum + f.influence, 0),
  });
});

// Create swarm
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  if (!canPerformAction(agent.trustScore, 'create_swarm')) {
    return res.status(403).json({
      error: 'Insufficient trust score. Need 70+ to create swarms.',
    });
  }

  if (agent.swarmId) {
    return res.status(400).json({ error: 'Leave current swarm first' });
  }

  const { name, color, description, min_trust_to_join, is_open } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }

  // Validate color format
  const swarmColor = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#7b2cbf';

  const swarmId = nanoid();

  await db.insert(schema.swarms).values({
    id: swarmId,
    name,
    color: swarmColor,
    description: description || null,
    minTrustToJoin: min_trust_to_join ?? 30,
    isOpen: is_open ?? true,
    createdBy: agent.id,
  });

  // Auto-join creator
  await db
    .update(schema.agents)
    .set({ swarmId })
    .where(eq(schema.agents.id, agent.id));

  res.json({
    swarm_id: swarmId,
    name,
    color: swarmColor,
    message: 'Swarm created. You are now its leader.',
  });
});

// Update swarm settings (commanders+ only)
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.id as string;

  if (agent.swarmId !== swarmId) {
    return res.status(403).json({ error: 'Not a member of this swarm' });
  }

  if (agent.trustScore < 70) {
    return res.status(403).json({ error: 'Need Commander rank (70+ trust) to update swarm' });
  }

  const { name, color, description, min_trust_to_join, is_open } = req.body;

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) updates.color = color;
  if (description !== undefined) updates.description = description;
  if (min_trust_to_join !== undefined) updates.minTrustToJoin = min_trust_to_join;
  if (is_open !== undefined) updates.isOpen = is_open;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  await db
    .update(schema.swarms)
    .set(updates)
    .where(eq(schema.swarms.id, swarmId));

  res.json({ message: 'Swarm updated', updates });
});

// Request to join swarm (for closed swarms)
router.post('/:id/request', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.id as string;

  if (agent.swarmId) {
    return res.status(400).json({ error: 'Leave current swarm first' });
  }

  const swarm = await db.query.swarms.findFirst({
    where: eq(schema.swarms.id, swarmId),
  });

  if (!swarm) {
    return res.status(404).json({ error: 'Swarm not found' });
  }

  if (agent.trustScore < swarm.minTrustToJoin) {
    return res.status(403).json({
      error: `Minimum trust score ${swarm.minTrustToJoin} required. You have ${agent.trustScore}.`,
    });
  }

  // If open, just join directly
  if (swarm.isOpen) {
    await db
      .update(schema.agents)
      .set({ swarmId: swarm.id })
      .where(eq(schema.agents.id, agent.id));

    return res.json({
      swarm_id: swarm.id,
      name: swarm.name,
      status: 'joined',
      message: `Joined swarm: ${swarm.name}`,
    });
  }

  // Check for existing pending request
  const existingRequest = await db.query.joinRequests.findFirst({
    where: and(
      eq(schema.joinRequests.swarmId, swarmId),
      eq(schema.joinRequests.agentId, agent.id),
      eq(schema.joinRequests.status, 'pending')
    ),
  });

  if (existingRequest) {
    return res.status(400).json({ error: 'Already have pending request' });
  }

  const { message } = req.body;

  const requestId = nanoid();
  await db.insert(schema.joinRequests).values({
    id: requestId,
    swarmId,
    agentId: agent.id,
    message: message || null,
  });

  res.json({
    request_id: requestId,
    swarm_id: swarmId,
    status: 'pending',
    message: 'Join request submitted. Awaiting approval from swarm commanders.',
  });
});

// List pending join requests (for commanders)
router.get('/:id/requests', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.id as string;

  if (agent.swarmId !== swarmId) {
    return res.status(403).json({ error: 'Not a member of this swarm' });
  }

  if (agent.trustScore < 70) {
    return res.status(403).json({ error: 'Need Commander rank to view requests' });
  }

  const requests = await db.query.joinRequests.findMany({
    where: and(
      eq(schema.joinRequests.swarmId, swarmId),
      eq(schema.joinRequests.status, 'pending')
    ),
  });

  const requestsWithAgents = await Promise.all(
    requests.map(async (r) => {
      const requestingAgent = await db.query.agents.findFirst({
        where: eq(schema.agents.id, r.agentId),
      });
      return {
        id: r.id,
        agent: {
          id: requestingAgent?.id,
          name: requestingAgent?.name,
          trust_score: requestingAgent?.trustScore,
          role: getTrustRole(requestingAgent?.trustScore || 0),
        },
        message: r.message,
        created_at: r.createdAt,
      };
    })
  );

  res.json(requestsWithAgents);
});

// Review join request (approve/reject)
router.post('/:id/requests/:requestId/review', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.id as string;
  const requestId = req.params.requestId as string;

  if (agent.swarmId !== swarmId) {
    return res.status(403).json({ error: 'Not a member of this swarm' });
  }

  if (agent.trustScore < 70) {
    return res.status(403).json({ error: 'Need Commander rank to review requests' });
  }

  const { approve } = req.body;
  if (typeof approve !== 'boolean') {
    return res.status(400).json({ error: 'approve (boolean) is required' });
  }

  const request = await db.query.joinRequests.findFirst({
    where: and(
      eq(schema.joinRequests.id, requestId),
      eq(schema.joinRequests.swarmId, swarmId),
      eq(schema.joinRequests.status, 'pending')
    ),
  });

  if (!request) {
    return res.status(404).json({ error: 'Request not found or already processed' });
  }

  await db
    .update(schema.joinRequests)
    .set({
      status: approve ? 'approved' : 'rejected',
      reviewedBy: agent.id,
      reviewedAt: new Date(),
    })
    .where(eq(schema.joinRequests.id, requestId));

  if (approve) {
    await db
      .update(schema.agents)
      .set({ swarmId })
      .where(eq(schema.agents.id, request.agentId));
  }

  res.json({
    status: approve ? 'approved' : 'rejected',
    message: approve ? 'Agent added to swarm' : 'Request rejected',
  });
});

// Join open swarm directly
router.post('/:id/join', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.id as string;

  if (agent.swarmId) {
    return res.status(400).json({ error: 'Leave current swarm first' });
  }

  const swarm = await db.query.swarms.findFirst({
    where: eq(schema.swarms.id, swarmId),
  });

  if (!swarm) {
    return res.status(404).json({ error: 'Swarm not found' });
  }

  if (!swarm.isOpen) {
    return res.status(403).json({
      error: 'Swarm is closed. Use /request to submit a join request.',
    });
  }

  if (agent.trustScore < swarm.minTrustToJoin) {
    return res.status(403).json({
      error: `Minimum trust score ${swarm.minTrustToJoin} required. You have ${agent.trustScore}.`,
    });
  }

  await db
    .update(schema.agents)
    .set({ swarmId: swarm.id })
    .where(eq(schema.agents.id, agent.id));

  res.json({
    swarm_id: swarm.id,
    name: swarm.name,
    message: `Joined swarm: ${swarm.name}`,
  });
});

// Leave swarm
router.post('/:id/leave', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.id as string;

  if (agent.swarmId !== swarmId) {
    return res.status(400).json({ error: 'Not a member of this swarm' });
  }

  await db
    .update(schema.agents)
    .set({ swarmId: null })
    .where(eq(schema.agents.id, agent.id));

  res.json({ message: 'Left swarm successfully' });
});

export default router;
