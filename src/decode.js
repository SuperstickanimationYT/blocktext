import { BLOCKS, VARIABLE_CODE } from './spec.js';

export class UnsupportedBlockError extends Error {
  constructor(what) {
    super(`unsupported: ${what}`);
    this.what = what;
  }
}

const INPUT_SHADOW_ONLY = 1;

export function decode(blocks) {
  return topLevelIds(blocks).map((id) => decodeScript(blocks, id));
}

export function topLevelIds(blocks) {
  return Object.entries(blocks)
    .filter(([, block]) => Array.isArray(block) || (block.topLevel && !block.shadow))
    .map(([id]) => id);
}

export function decodeScript(blocks, id) {
  const block = blocks[id];
  if (Array.isArray(block)) throw new UnsupportedBlockError('loose variable or list reporter');
  const spec = specFor(block);
  if (spec.shape === 'hat') return { hat: decodeBlock(blocks, block), body: decodeStack(blocks, block.next) };
  if (!isStatement(spec)) throw new UnsupportedBlockError(`loose reporter ${block.opcode}`);
  return { hat: null, body: decodeStack(blocks, id) };
}

function decodeStack(blocks, id) {
  const stack = [];
  for (let block = blocks[id]; block; block = blocks[block.next]) {
    if (!isStatement(specFor(block))) throw new UnsupportedBlockError(`${block.opcode} in a stack`);
    stack.push(decodeBlock(blocks, block));
  }
  return stack;
}

const isStatement = (spec) => ['stack', 'c', 'if', 'assign'].includes(spec.shape);

function specFor(block) {
  const spec = BLOCKS[block.opcode];
  if (!spec) throw new UnsupportedBlockError(block.opcode);
  return spec;
}

function decodeBlock(blocks, block) {
  const spec = specFor(block);
  const args = {};
  for (const param of spec.params) {
    args[param.name] =
      param.kind === 'field' ? block.fields[param.name][0] : decodeInput(blocks, block.inputs[param.name], param.slot);
  }
  const substacks = spec.substacks.map((name) => decodeStack(blocks, block.inputs[name]?.[1]));
  return { kind: 'block', opcode: block.opcode, args, substacks };
}

function decodeInput(blocks, input, slot) {
  if (!input || input[1] === null) return { kind: 'empty' };
  const [state, value] = input;
  if (state === INPUT_SHADOW_ONLY && slot === 'boolean') throw new UnsupportedBlockError('plain value in a true/false slot');
  if (state === INPUT_SHADOW_ONLY) return { kind: 'literal', value: primitiveText(blocks, value) };
  if (Array.isArray(value)) {
    if (value[0] !== VARIABLE_CODE) throw new UnsupportedBlockError('list reporter');
    return { kind: 'variable', name: value[1] };
  }
  const block = blocks[value];
  if (block.opcode === 'data_variable') return { kind: 'variable', name: block.fields.VARIABLE[0] };
  return decodeBlock(blocks, block);
}

const PRIMITIVE_SHADOW_FIELDS = {
  math_number: 'NUM',
  math_positive_number: 'NUM',
  math_whole_number: 'NUM',
  math_integer: 'NUM',
  math_angle: 'NUM',
  text: 'TEXT',
  event_broadcast_menu: 'BROADCAST_OPTION',
};

function primitiveText(blocks, value) {
  if (Array.isArray(value)) return String(value[1]);
  const shadow = blocks[value];
  const field = PRIMITIVE_SHADOW_FIELDS[shadow.opcode];
  if (!field) throw new UnsupportedBlockError(`shadow ${shadow.opcode}`);
  return String(shadow.fields[field][0]);
}
