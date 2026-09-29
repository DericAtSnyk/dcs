import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { circuitFileSchema, SCHEMA_VERSION, type CircuitFile } from '@dcs/shared';
import { config } from '../config.js';
import { openDatabase } from '../db/schema.js';
import { loadCircuit } from '../db/loadCircuit.js';
import { saveCircuit } from '../db/saveCircuit.js';

export const circuitsRouter = Router();

const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

function resolveCircuitPath(filename: string): string {
  if (!FILENAME_PATTERN.test(filename)) {
    throw new Error('Invalid circuit filename');
  }
  const circuitsDir = path.resolve(config.circuitsDir);
  const resolved = path.join(circuitsDir, `${filename}.sqlite`);
  if (path.dirname(resolved) !== circuitsDir) {
    throw new Error('Invalid circuit filename');
  }
  return resolved;
}

function emptyCircuit(): CircuitFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    topLevelModuleId: 1,
    activeTabModuleId: 1,
    clockFrequencyHz: 1,
    modules: [
      {
        id: 1,
        name: 'main',
        isTopLevel: true,
        viewState: null,
        pins: [],
        components: [],
        nets: [],
        wireSegments: [],
        pinConnections: [],
      },
    ],
    waveformTracks: [],
  };
}

circuitsRouter.get('/', (_req, res) => {
  fs.mkdirSync(config.circuitsDir, { recursive: true });
  const files = fs
    .readdirSync(config.circuitsDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({
      filename: f.slice(0, -'.sqlite'.length),
      modifiedAt: fs.statSync(path.join(config.circuitsDir, f)).mtime.toISOString(),
    }));
  res.json(files);
});

circuitsRouter.post('/', (req, res) => {
  const filename = String(req.body?.filename ?? '');
  let filePath: string;
  try {
    filePath = resolveCircuitPath(filename);
  } catch {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  if (fs.existsSync(filePath)) {
    res.status(409).json({ error: 'A circuit with that name already exists' });
    return;
  }

  fs.mkdirSync(config.circuitsDir, { recursive: true });
  const circuit = emptyCircuit();
  const db = openDatabase(filePath);
  try {
    saveCircuit(db, circuit);
  } finally {
    db.close();
  }
  res.status(201).json({ filename, circuit });
});

circuitsRouter.get('/:filename', (req, res) => {
  let filePath: string;
  try {
    filePath = resolveCircuitPath(req.params.filename);
  } catch {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  const db = openDatabase(filePath);
  try {
    res.json(loadCircuit(db));
  } finally {
    db.close();
  }
});

circuitsRouter.put('/:filename', (req, res) => {
  let filePath: string;
  try {
    filePath = resolveCircuitPath(req.params.filename);
  } catch {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const parsed = circuitFileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid circuit payload', details: parsed.error.flatten() });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  const db = openDatabase(filePath);
  try {
    saveCircuit(db, parsed.data);
    res.json({ ok: true });
  } finally {
    db.close();
  }
});

circuitsRouter.post('/:filename/save-as', (req, res) => {
  const newFilename = String(req.body?.newFilename ?? '');
  let sourcePath: string;
  let destPath: string;
  try {
    sourcePath = resolveCircuitPath(req.params.filename);
    destPath = resolveCircuitPath(newFilename);
  } catch {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  if (!fs.existsSync(sourcePath)) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  if (fs.existsSync(destPath)) {
    res.status(409).json({ error: 'A circuit with that name already exists' });
    return;
  }
  fs.copyFileSync(sourcePath, destPath);
  res.status(201).json({ filename: newFilename });
});

circuitsRouter.delete('/:filename', (req, res) => {
  let filePath: string;
  try {
    filePath = resolveCircuitPath(req.params.filename);
  } catch {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.status(204).send();
});
