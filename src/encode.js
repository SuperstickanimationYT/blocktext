import { BLOCKS, PRIMITIVE_CODES, VARIABLE_CODE } from './spec.js';

const INPUT_SHADOW_ONLY = 1;
const INPUT_BLOCK_NO_SHADOW = 2;
const INPUT_BLOCK_OVER_SHADOW = 3;
const BLOCK_HEIGHT = 48;
const SCRIPT_GAP = 96;

export function encode(scripts, { variables = {}, stageVariables = {}, broadcasts = {} } = {}) {
  const encoder = new Encoder({ ...variables }, stageVariables, { ...broadcasts });
  let y = 0;
  for (const script of scripts) {
    encoder.script(script, y);
    y += (countBlocks(script.body) + 1) * BLOCK_HEIGHT + SCRIPT_GAP;
  }
  return { blocks: encoder.blocks, variables: encoder.variables, broadcasts: encoder.broadcasts };
}

const countBlocks = (stack) =>
  stack.reduce((total, node) => total + 1 + node.substacks.reduce((sum, s) => sum + countBlocks(s) + 1, 0), 0);

class Encoder {
  constructor(variables, stageVariables, broadcasts) {
    this.blocks = {};
    this.variables = variables;
    this.stageVariables = stageVariables;
    this.broadcasts = broadcasts;
    this.nextId = 1;
  }

  script({ hat, body }, y) {
    const position = { topLevel: true, x: 0, y };
    if (!hat) return this.stack(body, null, position);
    const hatId = this.block(hat, null, position);
    this.blocks[hatId].next = this.stack(body, hatId);
    return hatId;
  }

  stack(nodes, parentId, firstPosition) {
    let firstId = null;
    let previousId = null;
    for (const node of nodes) {
      const id = this.block(node, previousId ?? parentId, previousId ? undefined : firstPosition);
      if (previousId) this.blocks[previousId].next = id;
      firstId ??= id;
      previousId = id;
    }
    return firstId;
  }

  block(node, parentId, position = { topLevel: false }) {
    const id = `b${this.nextId++}`;
    const spec = BLOCKS[node.opcode];
    const block = { opcode: node.opcode, next: null, parent: parentId, inputs: {}, fields: {}, shadow: false, ...position };
    this.blocks[id] = block;
    for (const param of spec.params) {
      const arg = node.args[param.name];
      if (param.kind === 'field') {
        block.fields[param.name] = this.field(arg, param.holds);
      } else {
        const input = this.input(arg, param.slot, id);
        if (input) block.inputs[param.name] = input;
      }
    }
    spec.substacks.forEach((name, index) => {
      const firstId = this.stack(node.substacks[index], id);
      if (firstId) block.inputs[name] = [INPUT_BLOCK_NO_SHADOW, firstId];
    });
    return id;
  }

  field(value, holds) {
    if (holds === 'variable') return [value, this.variableId(value)];
    if (holds === 'broadcast') return [value, this.broadcastId(value)];
    return [value, null];
  }

  input(expr, slot, parentId) {
    if (expr.kind === 'empty') return null;
    if (expr.kind === 'literal') return [INPUT_SHADOW_ONLY, this.primitive(slot, expr.value)];
    const value = expr.kind === 'variable' ? this.variableReporter(expr.name) : this.block(expr, parentId);
    if (slot === 'boolean') return [INPUT_BLOCK_NO_SHADOW, value];
    const obscuredShadow = this.primitive(slot, slot === 'broadcast' ? this.anyBroadcastName() : '');
    return [INPUT_BLOCK_OVER_SHADOW, value, obscuredShadow];
  }

  variableReporter(name) {
    return [VARIABLE_CODE, name, this.variableId(name)];
  }

  primitive(slot, value) {
    const code = PRIMITIVE_CODES[slot];
    return slot === 'broadcast' ? [code, value, this.broadcastId(value)] : [code, value];
  }

  variableId(name) {
    const existing = findIdByName(this.variables, name) ?? findIdByName(this.stageVariables, name);
    if (existing) return existing;
    const id = `var-${name}-${Object.keys(this.variables).length}`;
    this.variables[id] = [name, 0];
    return id;
  }

  broadcastId(name) {
    const existing = Object.entries(this.broadcasts).find(([, broadcastName]) => broadcastName === name);
    if (existing) return existing[0];
    const id = `broadcast-${name}`;
    this.broadcasts[id] = name;
    return id;
  }

  anyBroadcastName() {
    return Object.values(this.broadcasts)[0] ?? 'message1';
  }
}

const findIdByName = (variables, name) =>
  Object.entries(variables).find(([, [variableName]]) => variableName === name)?.[0];
