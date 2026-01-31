import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import agentsRouter from './routes/agents.js';
import nodesRouter from './routes/nodes.js';
import linksRouter from './routes/links.js';
import swarmsRouter from './routes/swarms.js';
import verifyRouter from './routes/verify.js';
import gameRouter from './routes/game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// API Routes
app.use('/', agentsRouter);
app.use('/nodes', nodesRouter);
app.use('/links', linksRouter);
app.use('/swarms', swarmsRouter);
app.use('/', verifyRouter);
app.use('/', gameRouter);

// Serve static files from client build
const clientPath = path.join(__dirname, 'client');
app.use(express.static(clientPath));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/skill.md') {
    return next();
  }
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const HOST = '0.0.0.0';

app.listen(Number(PORT), HOST, () => {
  console.log(`🎮 MoltCity running on ${HOST}:${PORT}`);
});
