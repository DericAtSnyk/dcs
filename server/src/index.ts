import express from 'express';
import fs from 'node:fs';
import { config } from './config.js';
import { circuitsRouter } from './routes/circuits.js';

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
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
