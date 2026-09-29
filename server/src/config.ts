import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: '127.0.0.1',
  circuitsDir: process.env.CIRCUITS_DIR ?? path.resolve(__dirname, '../../circuits'),
  clientDistDir: path.resolve(__dirname, '../../client/dist'),
};
