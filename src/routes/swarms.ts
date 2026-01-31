import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canPerformAction } from '../logic/trust.js';

const router = Router();

// List all swarms
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

      return {
        id: s.id,
        name: s.name,
        member_count: members.length,
        node_count: nodes.length,
        field_count: fields.length,
        influence: totalInfluence,
        created_at: s.createdAt,
      };
    })
  );

  res.json(swarmsWithStats);
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

  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const swarmId = nanoid();

  await db.insert(schema.swarms).values({
    id: swarmId,
    name,
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
    message: 'Swarm created. You are now its leader.',
  });
});

// Join swarm
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
