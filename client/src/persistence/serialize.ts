import type { CircuitFile } from '@dcs/shared';

export interface CircuitListEntry {
  filename: string;
  modifiedAt: string;
}

async function expectOk(res: Response, fallbackMessage: string): Promise<Response> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? fallbackMessage);
  }
  return res;
}

export async function listCircuits(): Promise<CircuitListEntry[]> {
  const res = await expectOk(await fetch('/api/circuits'), 'Failed to list circuits');
  return res.json();
}

export async function createCircuit(filename: string): Promise<CircuitFile> {
  const res = await expectOk(
    await fetch('/api/circuits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    }),
    'Failed to create circuit',
  );
  return (await res.json()).circuit;
}

export async function loadCircuitFile(filename: string): Promise<CircuitFile> {
  const res = await expectOk(
    await fetch(`/api/circuits/${encodeURIComponent(filename)}`),
    'Failed to load circuit',
  );
  return res.json();
}

export async function saveCircuitFile(filename: string, circuit: CircuitFile): Promise<void> {
  await expectOk(
    await fetch(`/api/circuits/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(circuit),
    }),
    'Failed to save circuit',
  );
}

export async function deleteCircuitFile(filename: string): Promise<void> {
  await expectOk(
    await fetch(`/api/circuits/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
    'Failed to delete circuit',
  );
}
