import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PROJECTS_FILE = path.join(ROOT, 'src/data/projects.json');

export async function readProjects() {
  return JSON.parse(await fs.readFile(PROJECTS_FILE, 'utf8'));
}

export async function writeProjects(projects) {
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2) + '\n');
}

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
