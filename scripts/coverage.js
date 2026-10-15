import { readFileSync } from 'node:fs';
import { openProjectFile, targetToText } from '../src/index.js';

const blockers = new Map();
let converted = 0;
let total = 0;

for (const path of process.argv.slice(2)) {
  const { project } = await openProjectFile(readFileSync(path));
  for (const target of project.targets) {
    const { convertedIds, kept } = targetToText(target);
    converted += convertedIds.size;
    total += convertedIds.size + kept.length;
    for (const { id, reason } of kept) {
      blockers.set(reason, (blockers.get(reason) ?? 0) + 1);
      if (reason === 'changes when converted back') console.log(`FAIL ${path} / ${target.name}: script ${id} ${reason}`);
    }
  }
}

console.log(`${converted}/${total} scripts fully supported and round-trip cleanly`);
console.log('\nmost common blockers (scripts blocked):');
for (const [what, count] of [...blockers].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${String(count).padStart(6)}  ${what}`);
}
