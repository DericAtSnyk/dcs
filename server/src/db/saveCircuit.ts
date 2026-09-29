import type { DatabaseSync } from 'node:sqlite';
import type { CircuitFile } from '@dcs/shared';

// Order matters: children before parents, to satisfy foreign key constraints on delete.
const TABLES_IN_DELETE_ORDER = [
  'waveform_tracks',
  'pin_connections',
  'wire_segments',
  'nets',
  'component_instances',
  'module_pins',
  'modules',
  'circuit_meta',
];

/**
 * Full wipe-and-rewrite on every save. Circuits here are small (tens to a
 * few hundred components), so this is simpler and safer than incremental
 * diffing — no risk of orphaned rows from a partially-applied diff.
 */
export function saveCircuit(db: DatabaseSync, circuit: CircuitFile): void {
  db.exec('BEGIN');
  try {
    for (const table of TABLES_IN_DELETE_ORDER) {
      db.exec(`DELETE FROM ${table}`);
    }

    db.prepare(
      'INSERT INTO circuit_meta (id, top_level_module_id, active_tab_module_id, clock_frequency_hz, schema_version) VALUES (1, ?, ?, ?, ?)',
    ).run(circuit.topLevelModuleId, circuit.activeTabModuleId, circuit.clockFrequencyHz, circuit.schemaVersion);

    const insertModule = db.prepare('INSERT INTO modules (id, name, is_top_level, view_state_json) VALUES (?, ?, ?, ?)');
    const insertPin = db.prepare(
      'INSERT INTO module_pins (id, module_id, direction, bit_width, order_index, name, source_component_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertComponent = db.prepare(
      'INSERT INTO component_instances (id, module_id, type, x, y, rotation, mirrored, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertNet = db.prepare('INSERT INTO nets (id, module_id, bit_width, is_bus) VALUES (?, ?, ?, ?)');
    const insertWireSegment = db.prepare('INSERT INTO wire_segments (id, net_id, x1, y1, x2, y2) VALUES (?, ?, ?, ?, ?, ?)');
    const insertPinConnection = db.prepare(
      'INSERT INTO pin_connections (id, net_id, component_instance_id, pin_index, pin_kind) VALUES (?, ?, ?, ?, ?)',
    );
    const insertWaveformTrack = db.prepare(
      'INSERT INTO waveform_tracks (id, top_module_id, instance_path_json, label, color) VALUES (?, ?, ?, ?, ?)',
    );

    for (const module of circuit.modules) {
      insertModule.run(
        module.id,
        module.name,
        module.isTopLevel ? 1 : 0,
        module.viewState ? JSON.stringify(module.viewState) : null,
      );
      for (const pin of module.pins) {
        insertPin.run(pin.id, pin.moduleId, pin.direction, pin.bitWidth, pin.orderIndex, pin.name, pin.sourceComponentId);
      }
      for (const component of module.components) {
        insertComponent.run(
          component.id,
          component.moduleId,
          component.type,
          component.x,
          component.y,
          component.rotation,
          component.mirrored ? 1 : 0,
          JSON.stringify(component.properties),
        );
      }
      for (const net of module.nets) {
        insertNet.run(net.id, net.moduleId, net.bitWidth, net.isBus ? 1 : 0);
      }
      for (const segment of module.wireSegments) {
        insertWireSegment.run(segment.id, segment.netId, segment.x1, segment.y1, segment.x2, segment.y2);
      }
      for (const connection of module.pinConnections) {
        insertPinConnection.run(
          connection.id,
          connection.netId,
          connection.componentInstanceId,
          connection.pinIndex,
          connection.pinKind,
        );
      }
    }

    for (const track of circuit.waveformTracks) {
      insertWaveformTrack.run(track.id, track.topModuleId, JSON.stringify(track.instancePath), track.label, track.color);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
