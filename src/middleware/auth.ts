import { Request, Response, NextFunction } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  agent?: typeof schema.agents.$inferSelect;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const apiKey = authHeader.slice(7);

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.apiKey, apiKey),
  });

  if (!agent) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Update last active
  await db
    .update(schema.agents)
    .set({ lastActive: new Date() })
    .where(eq(schema.agents.id, agent.id));

  req.agent = agent;
  next();
}
