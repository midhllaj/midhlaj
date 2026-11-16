// Runs @imgly/background-removal-node in its own process (it bundles a libvips that clashes with sharp's).
// usage: node scripts/lib/cutout.js <in.png> <out.png>
import fs from 'node:fs/promises';
import { removeBackground } from '@imgly/background-removal-node';

const [input, output] = process.argv.slice(2);
const buf = await fs.readFile(input);
const blob = await removeBackground(new Blob([buf], { type: 'image/png' }), { model: 'medium', output: { format: 'image/png' } });
await fs.writeFile(output, Buffer.from(await blob.arrayBuffer()));
console.log('cutout written');
