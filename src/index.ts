import express from 'express';
import cors from 'cors';

import agentsRouter from './routes/agents.js';
import nodesRouter from './routes/nodes.js';
import linksRouter from './routes/links.js';
import swarmsRouter from './routes/swarms.js';
import verifyRouter from './routes/verify.js';
import gameRouter from './routes/game.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', game: 'moltcity' });
});

// Serve skill.md at root for agent discovery
app.get('/skill.md', (req, res) => {
  res.sendFile('skill.md', { root: process.cwd() });
});

// Routes
app.use('/', agentsRouter);
app.use('/nodes', nodesRouter);
app.use('/links', linksRouter);
app.use('/swarms', swarmsRouter);
app.use('/', verifyRouter);
app.use('/', gameRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🎮 MoltCity running on port ${PORT}`);
  console.log(`📜 Skill docs: http://localhost:${PORT}/skill.md`);
});
