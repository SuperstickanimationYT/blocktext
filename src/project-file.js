import { deflatedEntry, entryBytes, readZip, writeZip } from './zip.js';

const PROJECT_ENTRY = 'project.json';
const ZIP_MAGIC = [0x50, 0x4b];

export async function openProjectFile(bytes) {
  if (bytes[0] !== ZIP_MAGIC[0] || bytes[1] !== ZIP_MAGIC[1]) {
    return { project: JSON.parse(new TextDecoder().decode(bytes)), entries: null };
  }
  const entries = readZip(bytes);
  const projectEntry = entries.find((entry) => entry.name === PROJECT_ENTRY);
  if (!projectEntry) throw new Error('this file has no project.json inside');
  const project = JSON.parse(new TextDecoder().decode(await entryBytes(projectEntry)));
  return { project, entries };
}

export async function saveProjectFile(project, entries) {
  const json = new TextEncoder().encode(JSON.stringify(project));
  if (!entries) return json;
  const others = entries.filter((entry) => entry.name !== PROJECT_ENTRY);
  return writeZip([await deflatedEntry(PROJECT_ENTRY, json), ...others]);
}
