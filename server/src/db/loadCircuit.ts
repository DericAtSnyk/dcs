import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type {
  CircuitFile,
  ComponentInstance,
  Module,
  ModulePin,
  Net,
  PinConnection,
  WaveformTrack,
  WireSegment,
} from '@dcs/shared';

interface CircuitMetaRow {
  top_level_module_id: number;
  active_tab_module_id: number | null;
  clock_frequency_hz: number;
  schema_version: number;
}

interface ModuleRow {
  id: number;
  name: string;
  is_top_level: number;
  view_state_json: string | null;
}

interface ModulePinRow {
  id: number;
  module_id: number;
  direction: 'in' | 'out';
  bit_width: number;
  order_index: number;
  name: string;
  source_component_id: number;
}

interface ComponentRow {
  id: number;
  module_id: number;
  type: ComponentInstance['type'];
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  mirrored: number;
  properties_json: string;
}

interface NetRow {
  id: number;
  module_id: number;
  bit_width: number;
  is_bus: number;
}

interface WireSegmentRow {
  id: number;
  net_id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PinConnectionRow {
  id: number;
  net_id: number;
  component_instance_id: number;
  pin_index: number;
  pin_kind: 'in' | 'out';
}

interface WaveformTrackRow {
  id: number;
  top_module_id: number;
  instance_path_json: string;
  label: string | null;
  color: string | null;
}

/** node:sqlite types `.all()`/`.get()` as generic SQLOutputValue rows; this
 * asserts the shape we know each query returns given our fixed schema. */
function allRows<T>(statement: StatementSync, ...params: (number | string)[]): T[] {
  return statement.all(...params) as unknown as T[];
}

export function loadCircuit(db: DatabaseSync): CircuitFile {
  const meta = db.prepare('SELECT * FROM circuit_meta WHERE id = 1').get() as unknown as CircuitMetaRow | undefined;
  if (!meta) {
    throw new Error('circuit_meta row missing — file is not a valid DCS circuit');
  }

  const moduleRows = allRows<ModuleRow>(db.prepare('SELECT * FROM modules'));

  const modules: Module[] = moduleRows.map((m): Module => {
    const pins: ModulePin[] = allRows<ModulePinRow>(
      db.prepare('SELECT * FROM module_pins WHERE module_id = ? ORDER BY order_index'),
      m.id,
    ).map((p) => ({
      id: p.id,
      moduleId: p.module_id,
      direction: p.direction,
      bitWidth: p.bit_width,
      orderIndex: p.order_index,
      name: p.name,
      sourceComponentId: p.source_component_id,
    }));

    const components: ComponentInstance[] = allRows<ComponentRow>(
      db.prepare('SELECT * FROM component_instances WHERE module_id = ?'),
      m.id,
    ).map((c) => ({
      id: c.id,
      moduleId: c.module_id,
      type: c.type,
      x: c.x,
      y: c.y,
      rotation: c.rotation,
      mirrored: !!c.mirrored,
      properties: JSON.parse(c.properties_json),
    }));

    const nets: Net[] = allRows<NetRow>(db.prepare('SELECT * FROM nets WHERE module_id = ?'), m.id).map((n) => ({
      id: n.id,
      moduleId: n.module_id,
      bitWidth: n.bit_width,
      isBus: !!n.is_bus,
    }));

    const netIds = nets.map((n) => n.id);
    const placeholders = netIds.map(() => '?').join(',');

    const wireSegments: WireSegment[] = netIds.length
      ? allRows<WireSegmentRow>(
          db.prepare(`SELECT * FROM wire_segments WHERE net_id IN (${placeholders})`),
          ...netIds,
        ).map((w) => ({ id: w.id, netId: w.net_id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }))
      : [];

    const pinConnections: PinConnection[] = netIds.length
      ? allRows<PinConnectionRow>(
          db.prepare(`SELECT * FROM pin_connections WHERE net_id IN (${placeholders})`),
          ...netIds,
        ).map((p) => ({
          id: p.id,
          netId: p.net_id,
          componentInstanceId: p.component_instance_id,
          pinIndex: p.pin_index,
          pinKind: p.pin_kind,
        }))
      : [];

    return {
      id: m.id,
      name: m.name,
      isTopLevel: !!m.is_top_level,
      viewState: m.view_state_json ? JSON.parse(m.view_state_json) : null,
      pins,
      components,
      nets,
      wireSegments,
      pinConnections,
    };
  });

  const waveformTracks: WaveformTrack[] = allRows<WaveformTrackRow>(db.prepare('SELECT * FROM waveform_tracks')).map(
    (w) => ({
      id: w.id,
      topModuleId: w.top_module_id,
      instancePath: JSON.parse(w.instance_path_json),
      label: w.label,
      color: w.color,
    }),
  );

  return {
    schemaVersion: meta.schema_version,
    topLevelModuleId: meta.top_level_module_id,
    activeTabModuleId: meta.active_tab_module_id,
    clockFrequencyHz: meta.clock_frequency_hz,
    modules,
    waveformTracks,
  };
}
