# Digital Circuit Simulator (DCS)

A browser-based tool for building, running, and analyzing digital logic
circuits — drag-and-drop schematic editing, live simulation, an adjustable
clock, truth tables, and a waveform viewer.

> **⚠️ Demo project — not for production use.**
> This was built as a personal learning tool to explore digital logic design
> and circuit simulation. It has no authentication, is meant to run locally
> on a single machine for a single user, and has not been hardened for
> production deployment, multi-user use, or exposure to untrusted networks.
> Do not deploy this as-is on the public internet or use it to handle
> sensitive data.

## Features

- **Component library**: basic gates (AND/OR/NOT/NAND/NOR/XOR/XNOR, configurable
  2–8 inputs), bus splitter/merger, D/JK/SR flip-flops and latches (async
  clear), multiplexer/demultiplexer/priority-encoder/decoder, ripple-carry
  adder, register, counter, BCD-to-7-segment decoder, switches, push
  buttons, an adjustable clock, LEDs, and a hex/decimal value display.
- **Schematic editor**: drag-and-drop placement, click-click or drag-to-connect
  wiring, grid-snapped orthogonal routing, undo/redo, copy/paste/duplicate,
  rotate/mirror.
- **Sub-circuits**: turn any circuit into a reusable black-box module with its
  own input/output pins, and instantiate it elsewhere — multiple instances
  keep fully independent internal state.
- **Simulation**: zero-delay tri-state (0/1/X) logic with a global clock
  (Run/Pause/Step, adjustable frequency).
- **Analysis**: exhaustive truth table generation for any module, and a
  scrolling waveform viewer with auto-tracked I/O plus manually tracked wires.
- **Persistence**: circuits are saved to SQLite files, managed through a small
  local REST API.

## Tech stack

- **Client**: React + TypeScript, Vite, Zustand, SVG-based schematic
  rendering, Canvas-based waveform rendering.
- **Server**: Node.js + Express, `node:sqlite` for persistence.
- **Shared**: a TypeScript package of types and Zod schemas used by both.
- **Tests**: Vitest (82 tests across the simulation engine, editor store, and
  persistence layer).

## Getting started

Requires Node.js and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

This starts the Express server (`http://localhost:3001`) and the Vite dev
server (`http://localhost:5173`, proxying `/api` to the server). Open
`http://localhost:5173` in a browser.

Saved circuits are written to `circuits/*.sqlite` in the project root
(git-ignored).

## Project structure

```
client/    React/TypeScript frontend — editor, simulation engine, analysis views
server/    Express backend — serves the client build, SQLite-backed REST API
shared/    Types and validation schemas used by both client and server
```

## Testing

```bash
pnpm -r run test    # run all tests
```

## License

No license has been chosen for this project. All rights reserved by the
author unless stated otherwise.
