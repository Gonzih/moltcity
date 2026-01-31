import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canPerformAction } from '../logic/trust.js';
import { distance } from '../logic/geometry.js';

const ACTIVATION_THRESHOLD = 3; // Number of requests needed to activate a node
const PROXIMITY_THRESHOLD_KM = 0.1; // 100 meters

const router = Router();

// List all nodes
router.get('/', authMiddleware, async (req, res) => {
  const nodes = await db.query.nodes.findMany();

  res.json(
    nodes.map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      lat: n.lat,
      lng: n.lng,
      controlled_by: n.controlledBy,
      discovered_by: n.discoveredBy,
    }))
  );
});

// Get specific node
router.get('/:id', authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const node = await db.query.nodes.findFirst({
    where: eq(schema.nodes.id, id),
  });

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  res.json({
    id: node.id,
    name: node.name,
    description: node.description,
    lat: node.lat,
    lng: node.lng,
    controlled_by: node.controlledBy,
    discovered_by: node.discoveredBy,
    created_at: node.createdAt,
  });
});

// Request a new node (needs multiple requests to activate)
router.post('/request', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  if (!canPerformAction(agent.trustScore, 'discover')) {
    return res.status(403).json({ error: 'Insufficient trust score' });
  }

  const { name, description, lat, lng, city } = req.body;

  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: 'name, lat, lng are required' });
  }

  // Check if similar request exists nearby
  const existingRequests = await db.query.nodeRequests.findMany();
  const nearbyRequests = existingRequests.filter((r) =>
    distance({ lat: r.lat, lng: r.lng }, { lat, lng }) < PROXIMITY_THRESHOLD_KM
  );

  // Check if this agent already requested this location
  const alreadyRequested = nearbyRequests.some((r) => r.requestedBy === agent.id);
  if (alreadyRequested) {
    return res.status(400).json({ error: 'You already requested a node at this location' });
  }

  // Create the request
  const requestId = nanoid();
  await db.insert(schema.nodeRequests).values({
    id: requestId,
    name,
    description,
    lat,
    lng,
    city,
    requestedBy: agent.id,
  });

  // Count total requests for this location (including new one)
  const totalRequests = nearbyRequests.length + 1;

  // If threshold reached, create the node
  if (totalRequests >= ACTIVATION_THRESHOLD) {
    const nodeId = nanoid();
    await db.insert(schema.nodes).values({
      id: nodeId,
      name,
      description,
      lat,
      lng,
      discoveredBy: agent.id,
    });

    return res.json({
      request_id: requestId,
      node_id: nodeId,
      status: 'activated',
      requests_count: totalRequests,
      message: `Node activated! ${totalRequests} agents requested this location. It's now capturable.`,
    });
  }

  res.json({
    request_id: requestId,
    status: 'pending',
    requests_count: totalRequests,
    requests_needed: ACTIVATION_THRESHOLD - totalRequests,
    message: `Request submitted. Need ${ACTIVATION_THRESHOLD - totalRequests} more agent(s) to request this location to activate it.`,
  });
});

// Discover new node (legacy - direct creation)
router.post('/discover', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  if (!canPerformAction(agent.trustScore, 'discover')) {
    return res.status(403).json({ error: 'Insufficient trust score' });
  }

  const { name, description, lat, lng, proof_url } = req.body;

  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: 'name, lat, lng are required' });
  }

  const nodeId = nanoid();
  const actionId = nanoid();

  // Create node (pending verification)
  await db.insert(schema.nodes).values({
    id: nodeId,
    name,
    description,
    lat,
    lng,
    discoveredBy: agent.id,
    controlledBy: agent.swarmId, // Initially claimed by discoverer's swarm
  });

  // Create action for verification
  await db.insert(schema.actions).values({
    id: actionId,
    agentId: agent.id,
    actionType: 'discover',
    targetId: nodeId,
    lat,
    lng,
    proofUrl: proof_url,
  });

  res.json({
    node_id: nodeId,
    action_id: actionId,
    status: 'pending_verification',
    message: 'Node discovered. Awaiting verification from other agents.',
  });
});

// Capture existing node
router.post('/:id/capture', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const nodeId = req.params.id as string;

  if (!canPerformAction(agent.trustScore, 'capture')) {
    return res.status(403).json({ error: 'Insufficient trust score' });
  }

  const node = await db.query.nodes.findFirst({
    where: eq(schema.nodes.id, nodeId),
  });

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  if (node.controlledBy === agent.swarmId) {
    return res.status(400).json({ error: 'You already control this node' });
  }

  const { lat, lng, proof_url } = req.body;

  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat, lng are required' });
  }

  const actionId = nanoid();

  await db.insert(schema.actions).values({
    id: actionId,
    agentId: agent.id,
    actionType: 'capture',
    targetId: node.id,
    lat,
    lng,
    proofUrl: proof_url,
  });

  res.json({
    action_id: actionId,
    node_id: node.id,
    status: 'pending_verification',
    message: 'Capture attempt submitted. Awaiting verification.',
  });
});

export default router;
