import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION } from '@dcs/shared';

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS circuit_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  top_level_module_id INTEGER NOT NULL,
  active_tab_module_id INTEGER,
  clock_frequency_hz REAL NOT NULL DEFAULT 1.0,
  schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_top_level INTEGER NOT NULL DEFAULT 0,
  view_state_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS module_pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  bit_width INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_component_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS component_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  rotation INTEGER NOT NULL DEFAULT 0,
  mirrored INTEGER NOT NULL DEFAULT 0,
  properties_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  bit_width INTEGER NOT NULL DEFAULT 1,
  is_bus INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wire_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
  x1 INTEGER NOT NULL, y1 INTEGER NOT NULL,
  x2 INTEGER NOT NULL, y2 INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pin_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
  component_instance_id INTEGER NOT NULL REFERENCES component_instances(id) ON DELETE CASCADE,
  pin_index INTEGER NOT NULL,
  pin_kind TEXT NOT NULL CHECK (pin_kind IN ('in','out'))
);

CREATE TABLE IF NOT EXISTS waveform_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  top_module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  instance_path_json TEXT NOT NULL,
  label TEXT,
  color TEXT
);

CREATE INDEX IF NOT EXISTS idx_component_instances_module ON component_instances(module_id);
CREATE INDEX IF NOT EXISTS idx_pin_connections_net ON pin_connections(net_id);
CREATE INDEX IF NOT EXISTS idx_pin_connections_component ON pin_connections(component_instance_id);
CREATE INDEX IF NOT EXISTS idx_wire_segments_net ON wire_segments(net_id);
`;

export function openDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CREATE_TABLES_SQL);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}
