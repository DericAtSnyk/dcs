import express from 'express';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { circuitsRouter } from './routes/circuits.js';

const app = express();
app.use(express.json());

// Checks the things a circuit save/load depends on: the SQLite driver works
// and the circuits directory is writable. Returns 503 if either fails.
app.get('/api/health', (_req, res) => {
  const checks = { sqlite: false, circuitsDir: false };
  try {
    const db = new DatabaseSync(':memory:');
    checks.sqlite = db.prepare('SELECT 1 AS ok').get()?.ok === 1;
    db.close();
  } catch {
    // leave sqlite check false
  }
  try {
    fs.accessSync(config.circuitsDir, fs.constants.R_OK | fs.constants.W_OK);
    checks.circuitsDir = true;
  } catch {
    // leave circuitsDir check false
  }
  const healthy = checks.sqlite && checks.circuitsDir;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  });
});

app.use('/api/circuits', circuitsRouter);

if (fs.existsSync(config.clientDistDir)) {
  app.use(express.static(config.clientDistDir));
  app.get('*', (_req, res) => {
    res.sendFile(`${config.clientDistDir}/index.html`);
  });
}

// Catches anything thrown by a route handler (e.g. a SQLite constraint
// violation) and returns JSON instead of falling through to Express's
// default HTML error page, which breaks every client here since they all
// expect JSON. Local single-user app, so the real error message is safe
// (and useful) to return rather than a generic one.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
});

app.listen(config.port, config.host, () => {
  console.log(`DCS server listening on http://${config.host}:${config.port}`);
});
