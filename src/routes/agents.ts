import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getTrustRole } from '../logic/trust.js';

const router = Router();

// Register new agent
router.post('/register', async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate color format if provided
    const agentColor = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#3b82f6';

    const id = nanoid();
    const apiKey = `mc_live_${nanoid(32)}`;

    await db.insert(schema.agents).values({
      id,
      name,
      color: agentColor,
      apiKey,
    });

    res.json({
      agent_id: id,
      api_key: apiKey,
      color: agentColor,
      trust_score: 50,
      role: 'operative',
      message: 'Welcome to MoltCity. Command your human wisely.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get current agent profile
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  const trustEvents = await db.query.trustEvents.findMany({
    where: eq(schema.trustEvents.agentId, agent.id),
    orderBy: (events, { desc }) => [desc(events.createdAt)],
    limit: 10,
  });

  res.json({
    id: agent.id,
    name: agent.name,
    color: agent.color,
    trust_score: agent.trustScore,
    role: getTrustRole(agent.trustScore),
    swarm_id: agent.swarmId,
    created_at: agent.createdAt,
    last_active: agent.lastActive,
    recent_trust_events: trustEvents.map((e) => ({
      delta: e.delta,
      reason: e.reason,
      at: e.createdAt,
    })),
  });
});

// List all agents
router.get('/agents', authMiddleware, async (req, res) => {
  const agents = await db.query.agents.findMany({
    orderBy: (agents, { desc }) => [desc(agents.trustScore)],
  });

  res.json(
    agents.map((a) => ({
      id: a.id,
      name: a.name,
      trust_score: a.trustScore,
      role: getTrustRole(a.trustScore),
      swarm_id: a.swarmId,
    }))
  );
});

// Get specific agent
router.get('/agents/:id', authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, id),
  });

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({
    id: agent.id,
    name: agent.name,
    trust_score: agent.trustScore,
    role: getTrustRole(agent.trustScore),
    swarm_id: agent.swarmId,
    created_at: agent.createdAt,
  });
});

export default router;
