import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, or, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canPerformAction } from '../logic/trust.js';
import { segmentsIntersect } from '../logic/geometry.js';
import { detectAndCreateFields } from '../logic/fields.js';

const router = Router();

// List all links
router.get('/', authMiddleware, async (req, res) => {
  const links = await db.query.links.findMany();

  res.json(
    links.map((l) => ({
      id: l.id,
      node_a: l.nodeA,
      node_b: l.nodeB,
      swarm_id: l.swarmId,
      created_by: l.createdBy,
    }))
  );
});

// Create link
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  if (!canPerformAction(agent.trustScore, 'link')) {
    return res.status(403).json({ error: 'Insufficient trust score' });
  }

  if (!agent.swarmId) {
    return res.status(400).json({ error: 'Must be in a swarm to create links' });
  }

  const { node_a, node_b } = req.body;

  if (!node_a || !node_b) {
    return res.status(400).json({ error: 'node_a and node_b are required' });
  }

  // Get both nodes
  const [nodeA, nodeB] = await Promise.all([
    db.query.nodes.findFirst({ where: eq(schema.nodes.id, node_a) }),
    db.query.nodes.findFirst({ where: eq(schema.nodes.id, node_b) }),
  ]);

  if (!nodeA || !nodeB) {
    return res.status(404).json({ error: 'One or both nodes not found' });
  }

  // Check both nodes belong to agent's swarm
  if (nodeA.controlledBy !== agent.swarmId || nodeB.controlledBy !== agent.swarmId) {
    return res.status(400).json({ error: 'Both nodes must be controlled by your swarm' });
  }

  // Check for existing link
  const existingLink = await db.query.links.findFirst({
    where: or(
      and(eq(schema.links.nodeA, node_a), eq(schema.links.nodeB, node_b)),
      and(eq(schema.links.nodeA, node_b), eq(schema.links.nodeB, node_a))
    ),
  });

  if (existingLink) {
    return res.status(400).json({ error: 'Link already exists' });
  }

  // Check for crossing links
  const allLinks = await db.query.links.findMany();
  const allNodes = await db.query.nodes.findMany();
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  for (const link of allLinks) {
    const linkNodeA = nodeMap.get(link.nodeA);
    const linkNodeB = nodeMap.get(link.nodeB);

    if (!linkNodeA || !linkNodeB) continue;

    if (
      segmentsIntersect(
        { lat: nodeA.lat, lng: nodeA.lng },
        { lat: nodeB.lat, lng: nodeB.lng },
        { lat: linkNodeA.lat, lng: linkNodeA.lng },
        { lat: linkNodeB.lat, lng: linkNodeB.lng }
      )
    ) {
      return res.status(400).json({
        error: 'Link would cross existing link',
        crossing_link_id: link.id,
      });
    }
  }

  // Create link
  const linkId = nanoid();

  await db.insert(schema.links).values({
    id: linkId,
    nodeA: node_a,
    nodeB: node_b,
    swarmId: agent.swarmId,
    createdBy: agent.id,
  });

  // Check for new fields
  await detectAndCreateFields(agent.swarmId);

  res.json({
    link_id: linkId,
    node_a,
    node_b,
    message: 'Link created successfully',
  });
});

export default router;
