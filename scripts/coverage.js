import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { UnsupportedBlockError, decode, encode, parse, print } from '../src/index.js';
import { decodeScript, topLevelIds } from '../src/decode.js';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const STORED = 0;

function readZipEntry(zip, wantedName) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || zip.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) throw new Error('not a zip file');
  let entry = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const nameLength = zip.readUInt16LE(entry + 28);
    const name = zip.toString('utf8', entry + 46, entry + 46 + nameLength);
    if (name === wantedName) {
      const method = zip.readUInt16LE(entry + 10);
      const size = zip.readUInt32LE(entry + 20);
      const local = zip.readUInt32LE(entry + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === STORED ? data : inflateRawSync(data);
    }
    entry += 46 + nameLength + zip.readUInt16LE(entry + 30) + zip.readUInt16LE(entry + 32);
  }
  throw new Error(`${wantedName} not found`);
}

const missing = new Map();
let supported = 0;
let total = 0;
const failures = [];

for (const path of process.argv.slice(2)) {
  const project = JSON.parse(readZipEntry(readFileSync(path), 'project.json'));
  for (const target of project.targets) {
    for (const id of topLevelIds(target.blocks)) {
      total++;
      try {
        const scripts = [decodeScript(target.blocks, id)];
        const again = decode(encode(parse(print(scripts))).blocks);
        if (isDeepStrictEqual(again, scripts)) supported++;
        else failures.push(`${path} / ${target.name}: round trip changed script ${id}`);
      } catch (error) {
        if (!(error instanceof UnsupportedBlockError)) throw error;
        missing.set(error.what, (missing.get(error.what) ?? 0) + 1);
      }
    }
  }
}

console.log(`${supported}/${total} scripts fully supported and round-trip cleanly`);
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log('\nmost common blockers (scripts blocked):');
for (const [what, count] of [...missing].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${String(count).padStart(6)}  ${what}`);
