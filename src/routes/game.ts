import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { getTrustRole } from '../logic/trust.js';

const router = Router();

// Public map state (no auth required) - for web UI and agents to scrape
router.get('/map/public', async (req, res) => {
  const [nodes, links, fields, swarms] = await Promise.all([
    db.query.nodes.findMany(),
    db.query.links.findMany(),
    db.query.fields.findMany(),
    db.query.swarms.findMany(),
  ]);

  res.json({
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      lat: n.lat,
      lng: n.lng,
      controlled_by: n.controlledBy,
    })),
    links: links.map((l) => ({
      id: l.id,
      node_a: l.nodeA,
      node_b: l.nodeB,
      swarm_id: l.swarmId,
    })),
    fields: fields.map((f) => ({
      id: f.id,
      nodes: [f.node1, f.node2, f.node3],
      swarm_id: f.swarmId,
      influence: f.influence,
    })),
    swarms: swarms.map((s) => ({
      id: s.id,
      name: s.name,
    })),
  });
});

// Get full map state (authenticated)
router.get('/map', authMiddleware, async (req, res) => {
  const [nodes, links, fields, swarms] = await Promise.all([
    db.query.nodes.findMany(),
    db.query.links.findMany(),
    db.query.fields.findMany(),
    db.query.swarms.findMany(),
  ]);

  res.json({
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      lat: n.lat,
      lng: n.lng,
      controlled_by: n.controlledBy,
    })),
    links: links.map((l) => ({
      id: l.id,
      node_a: l.nodeA,
      node_b: l.nodeB,
      swarm_id: l.swarmId,
    })),
    fields: fields.map((f) => ({
      id: f.id,
      nodes: [f.node1, f.node2, f.node3],
      swarm_id: f.swarmId,
      influence: f.influence,
    })),
    swarms: swarms.map((s) => ({
      id: s.id,
      name: s.name,
    })),
  });
});

// Get leaderboard
router.get('/leaderboard', authMiddleware, async (req, res) => {
  const agents = await db.query.agents.findMany({
    orderBy: desc(schema.agents.trustScore),
    limit: 50,
  });

  const swarms = await db.query.swarms.findMany();

  const swarmStats = await Promise.all(
    swarms.map(async (s) => {
      const fields = await db.query.fields.findMany({
        where: eq(schema.fields.swarmId, s.id),
      });
      const members = await db.query.agents.findMany({
        where: eq(schema.agents.swarmId, s.id),
      });

      return {
        id: s.id,
        name: s.name,
        influence: fields.reduce((sum, f) => sum + f.influence, 0),
        member_count: members.length,
        avg_trust: members.length
          ? Math.round(
              members.reduce((sum, m) => sum + m.trustScore, 0) / members.length
            )
          : 0,
      };
    })
  );

  res.json({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      trust_score: a.trustScore,
      role: getTrustRole(a.trustScore),
      swarm_id: a.swarmId,
    })),
    swarms: swarmStats.sort((a, b) => b.influence - a.influence),
  });
});

// Get fields
router.get('/fields', authMiddleware, async (req, res) => {
  const fields = await db.query.fields.findMany();

  res.json(
    fields.map((f) => ({
      id: f.id,
      nodes: [f.node1, f.node2, f.node3],
      swarm_id: f.swarmId,
      influence: f.influence,
      created_at: f.createdAt,
    }))
  );
});

export default router;
