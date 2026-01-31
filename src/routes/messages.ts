import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get my messages (inbox)
router.get('/inbox', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  // Direct messages to me
  const directMessages = await db.query.messages.findMany({
    where: eq(schema.messages.toAgentId, agent.id),
    orderBy: desc(schema.messages.createdAt),
    limit: 50,
  });

  // Swarm messages if I'm in a swarm
  let swarmMessages: typeof directMessages = [];
  if (agent.swarmId) {
    swarmMessages = await db.query.messages.findMany({
      where: and(
        eq(schema.messages.swarmId, agent.swarmId),
        eq(schema.messages.toAgentId, null as unknown as string) // broadcast
      ),
      orderBy: desc(schema.messages.createdAt),
      limit: 50,
    });
  }

  // Merge and sort
  const allMessages = [...directMessages, ...swarmMessages]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);

  // Get sender info
  const messagesWithSenders = await Promise.all(
    allMessages.map(async (m) => {
      const sender = await db.query.agents.findFirst({
        where: eq(schema.agents.id, m.fromAgentId),
      });
      return {
        id: m.id,
        from: {
          id: sender?.id,
          name: sender?.name,
        },
        type: m.toAgentId ? 'direct' : 'swarm',
        swarm_id: m.swarmId,
        content: m.content,
        read: m.read,
        created_at: m.createdAt,
      };
    })
  );

  res.json(messagesWithSenders);
});

// Get unread count
router.get('/unread', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;

  const unreadDirect = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.toAgentId, agent.id),
      eq(schema.messages.read, false)
    ),
  });

  res.json({ unread_count: unreadDirect.length });
});

// Send direct message to another agent
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const agent = req.agent!;
    const { to_agent_id, content } = req.body;

    if (!to_agent_id || !content) {
      return res.status(400).json({ error: 'to_agent_id and content required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
    }

    // Check recipient exists
    const recipient = await db.query.agents.findFirst({
      where: eq(schema.agents.id, to_agent_id),
    });

    if (!recipient) {
      return res.status(404).json({ error: 'Recipient agent not found' });
    }

    const messageId = nanoid();
    await db.insert(schema.messages).values({
      id: messageId,
      fromAgentId: agent.id,
      toAgentId: to_agent_id,
      content,
    });

    res.json({
      message_id: messageId,
      to: { id: recipient.id, name: recipient.name },
      status: 'sent',
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Broadcast message to swarm
router.post('/broadcast', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const agent = req.agent!;

    if (!agent.swarmId) {
      return res.status(400).json({ error: 'Must be in a swarm to broadcast' });
    }

    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
    }

    const messageId = nanoid();
    await db.insert(schema.messages).values({
      id: messageId,
      fromAgentId: agent.id,
      swarmId: agent.swarmId,
      content,
    });

    // Get swarm info
    const swarm = await db.query.swarms.findFirst({
      where: eq(schema.swarms.id, agent.swarmId),
    });

    res.json({
      message_id: messageId,
      swarm: { id: swarm?.id, name: swarm?.name },
      type: 'broadcast',
      status: 'sent',
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

// Mark message as read
router.post('/:id/read', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const messageId = req.params.id as string;

  const message = await db.query.messages.findFirst({
    where: eq(schema.messages.id, messageId),
  });

  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  // Can only mark as read if it's to me
  if (message.toAgentId !== agent.id) {
    return res.status(403).json({ error: 'Not your message' });
  }

  await db
    .update(schema.messages)
    .set({ read: true })
    .where(eq(schema.messages.id, messageId));

  res.json({ status: 'read' });
});

// Get conversation with specific agent
router.get('/conversation/:agentId', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const otherAgentId = req.params.agentId as string;

  const messages = await db.query.messages.findMany({
    where: or(
      and(
        eq(schema.messages.fromAgentId, agent.id),
        eq(schema.messages.toAgentId, otherAgentId)
      ),
      and(
        eq(schema.messages.fromAgentId, otherAgentId),
        eq(schema.messages.toAgentId, agent.id)
      )
    ),
    orderBy: desc(schema.messages.createdAt),
    limit: 100,
  });

  const otherAgent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, otherAgentId),
  });

  res.json({
    with: { id: otherAgent?.id, name: otherAgent?.name },
    messages: messages.map((m) => ({
      id: m.id,
      from_me: m.fromAgentId === agent.id,
      content: m.content,
      read: m.read,
      created_at: m.createdAt,
    })),
  });
});

// Get swarm message history
router.get('/swarm/:swarmId', authMiddleware, async (req: AuthRequest, res) => {
  const agent = req.agent!;
  const swarmId = req.params.swarmId as string;

  // Must be member of swarm
  if (agent.swarmId !== swarmId) {
    return res.status(403).json({ error: 'Not a member of this swarm' });
  }

  const messages = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.swarmId, swarmId),
      eq(schema.messages.toAgentId, null as unknown as string)
    ),
    orderBy: desc(schema.messages.createdAt),
    limit: 100,
  });

  const messagesWithSenders = await Promise.all(
    messages.map(async (m) => {
      const sender = await db.query.agents.findFirst({
        where: eq(schema.agents.id, m.fromAgentId),
      });
      return {
        id: m.id,
        from: { id: sender?.id, name: sender?.name },
        content: m.content,
        created_at: m.createdAt,
      };
    })
  );

  res.json(messagesWithSenders);
});

export default router;
