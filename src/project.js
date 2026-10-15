import { UnsupportedBlockError, decode, decodeScript, topLevelIds } from './decode.js';
import { encode } from './encode.js';
import { parse } from './parse.js';
import { print } from './print.js';

const KEPT_SCRIPTS_GAP = 600;

export function targetToText(target) {
  const converted = [];
  const kept = [];
  for (const id of topLevelIds(target.blocks)) {
    try {
      const script = decodeScript(target.blocks, id);
      const again = decode(encode([script]).blocks)[0];
      if (JSON.stringify(again) === JSON.stringify(script)) converted.push({ id, script });
      else kept.push({ id, reason: 'changes when converted back' });
    } catch (error) {
      if (!(error instanceof UnsupportedBlockError)) throw error;
      kept.push({ id, reason: error.what });
    }
  }
  return {
    text: print(converted.map(({ script }) => script)),
    convertedIds: new Set(converted.map(({ id }) => id)),
    kept,
  };
}

export function applyText(target, text, { convertedIds, stage }) {
  const scripts = parse(text);
  const roots = rootsOf(target.blocks);
  const isConverted = (id) => convertedIds.has(roots.get(id));
  const keptBlocks = Object.fromEntries(Object.entries(target.blocks).filter(([id]) => !isConverted(id)));

  const { blocks, variables, broadcasts } = encode(scripts, {
    variables: target.variables,
    stageVariables: target.isStage ? {} : stage.variables,
    broadcasts: stage.broadcasts,
    procedures: knownProcedures(keptBlocks),
    idPrefix: unusedPrefix(keptBlocks),
    x: rightOfKeptScripts(keptBlocks),
  });

  const comments = Object.fromEntries(
    Object.entries(target.comments ?? {}).map(([id, comment]) => [
      id,
      comment.blockId && isConverted(comment.blockId) ? { ...comment, blockId: null } : comment,
    ]),
  );
  return { blocks: { ...keptBlocks, ...blocks }, variables, broadcasts, comments };
}

function rootsOf(blocks) {
  const roots = new Map();
  for (const start of Object.keys(blocks)) {
    const chain = [];
    let id = start;
    while (!roots.has(id)) {
      chain.push(id);
      const parent = Array.isArray(blocks[id]) ? null : blocks[id].parent;
      if (!parent || !blocks[parent]) break;
      id = parent;
    }
    const root = roots.get(id) ?? id;
    for (const link of chain) roots.set(link, root);
  }
  return roots;
}

const isTrue = (flag) => flag === true || flag === 'true';

function knownProcedures(blocks) {
  const procedures = {};
  for (const block of Object.values(blocks)) {
    if (block.opcode !== 'procedures_prototype') continue;
    const definition = blocks[block.parent];
    if (!definition) continue;
    const { proccode, argumentids, warp, optype, color } = block.mutation;
    procedures[proccode] = {
      argumentIds: JSON.parse(argumentids),
      warp: isTrue(warp),
      returns: definition.opcode === 'procedures_definition_return' ? JSON.parse(optype ?? '"string"') : null,
      color: color ? JSON.parse(color) : null,
    };
  }
  return procedures;
}

function unusedPrefix(blocks) {
  const ids = Object.keys(blocks);
  let prefix = 'blocktext-';
  while (ids.some((id) => id.startsWith(prefix))) prefix = `_${prefix}`;
  return prefix;
}

function rightOfKeptScripts(blocks) {
  const xs = Object.values(blocks)
    .filter((block) => !Array.isArray(block) && block.topLevel)
    .map((block) => block.x ?? 0);
  return xs.length === 0 ? 0 : Math.max(...xs) + KEPT_SCRIPTS_GAP;
}
