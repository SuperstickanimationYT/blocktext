import { ARGUMENT_OPCODES, BLOCKS, PRIMITIVE_CODES, VARIABLE_CODE, defaultArgument, procedureSlots } from './spec.js';

const INPUT_SHADOW_ONLY = 1;
const INPUT_BLOCK_NO_SHADOW = 2;
const INPUT_BLOCK_OVER_SHADOW = 3;
const BLOCK_HEIGHT = 48;
const SCRIPT_GAP = 96;

export function encode(
  scripts,
  { variables = {}, stageVariables = {}, broadcasts = {}, procedures = {}, idPrefix = 'b', x = 0 } = {},
) {
  const encoder = new Encoder({ ...variables }, stageVariables, { ...broadcasts }, idPrefix);
  for (const [proccode, procedure] of Object.entries(procedures)) encoder.procedures.set(proccode, procedure);
  for (const { define } of scripts) if (define) encoder.registerProcedure(define);
  let y = 0;
  for (const script of scripts) {
    encoder.script(script, { x, y });
    y += (countBlocks(script.body) + 1) * BLOCK_HEIGHT + SCRIPT_GAP;
  }
  return { blocks: encoder.blocks, variables: encoder.variables, broadcasts: encoder.broadcasts };
}

const countBlocks = (stack) =>
  stack.reduce((total, node) => total + 1 + node.substacks.reduce((sum, s) => sum + countBlocks(s) + 1, 0), 0);

const mutation = (fields) => ({ tagName: 'mutation', children: [], ...fields });

class Encoder {
  constructor(variables, stageVariables, broadcasts, idPrefix) {
    this.blocks = {};
    this.variables = variables;
    this.stageVariables = stageVariables;
    this.broadcasts = broadcasts;
    this.idPrefix = idPrefix;
    this.nextId = 1;
    this.procedures = new Map();
    this.scope = null;
    this.procedure = null;
  }

  newId() {
    return `${this.idPrefix}${this.nextId++}`;
  }

  registerProcedure({ proccode, params, warp, returns, color }) {
    const argumentIds = params.map(() => this.newId());
    this.procedures.set(proccode, { argumentIds, warp, returns, color });
  }

  procedureFor(proccode) {
    if (!this.procedures.has(proccode)) {
      this.registerProcedure({ proccode, params: procedureSlots(proccode), warp: false, returns: null, color: null });
    }
    return this.procedures.get(proccode);
  }

  script({ hat, define, body }, { x, y }) {
    const position = { topLevel: true, x, y };
    if (define) return this.define(define, body, position);
    if (!hat) return this.stack(body, null, position);
    const hatId = this.block(hat, null, position);
    this.blocks[hatId].next = this.stack(body, hatId);
    return hatId;
  }

  define({ proccode, params, warp, returns, defaults }, body, position) {
    const procedure = this.procedures.get(proccode);
    const slots = procedureSlots(proccode);
    const defineId = this.newId();
    const prototypeId = this.newId();
    this.blocks[defineId] = {
      opcode: returns ? 'procedures_definition_return' : 'procedures_definition',
      next: null,
      parent: null,
      inputs: { custom_block: [INPUT_SHADOW_ONLY, prototypeId] },
      fields: {},
      shadow: false,
      ...position,
    };
    const prototype = {
      opcode: 'procedures_prototype',
      next: null,
      parent: defineId,
      inputs: {},
      fields: {},
      shadow: true,
      topLevel: false,
      mutation: mutation({
        proccode,
        argumentids: JSON.stringify(procedure.argumentIds),
        argumentnames: JSON.stringify(params),
        argumentdefaults: JSON.stringify(defaults ?? slots.map(defaultArgument)),
        warp: String(warp),
        ...penguinModFields(procedure, Boolean(returns)),
      }),
    };
    this.blocks[prototypeId] = prototype;

    this.procedure = procedure;
    params.forEach((name, index) => {
      const reporterId = this.argumentReporter(name, slots[index], prototypeId, true);
      prototype.inputs[procedure.argumentIds[index]] = [INPUT_SHADOW_ONLY, reporterId];
    });
    this.scope = new Map(params.map((name, index) => [name, slots[index]]));
    this.blocks[defineId].next = this.stack(body, defineId);
    this.scope = null;
    this.procedure = null;
    return defineId;
  }

  argumentReporter(name, slot, parentId, shadow) {
    const id = this.newId();
    this.blocks[id] = {
      opcode: ARGUMENT_OPCODES[slot],
      next: null,
      parent: parentId,
      inputs: {},
      fields: { VALUE: [name, null] },
      shadow,
      topLevel: false,
      ...(this.procedure?.color && { mutation: mutation({ color: JSON.stringify(this.procedure.color) }) }),
    };
    return id;
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

  block(node, parentId, position = { topLevel: false }, inExpression = false) {
    if (node.kind === 'argument') return this.argumentReporter(node.name, this.scope.get(node.name), parentId, false);
    const id = this.newId();
    const block = { opcode: node.opcode, next: null, parent: parentId, inputs: {}, fields: {}, shadow: false, ...position };
    this.blocks[id] = block;
    if (node.opcode === 'procedures_call') {
      this.fillCall(block, id, node, inExpression);
      return id;
    }
    const spec = BLOCKS[node.opcode];
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

  fillCall(block, id, { proccode, args }, inExpression) {
    const procedure = this.procedureFor(proccode);
    const slots = procedureSlots(proccode);
    args.forEach((arg, index) => {
      const input = this.input(arg, slots[index], id);
      if (input) block.inputs[procedure.argumentIds[index]] = input;
    });
    block.mutation = mutation({
      proccode,
      argumentids: JSON.stringify(procedure.argumentIds),
      warp: String(procedure.warp),
      ...penguinModFields(procedure, inExpression),
    });
  }

  field(value, holds) {
    if (holds === 'variable') return [value, this.variableId(value)];
    if (holds === 'broadcast') return [value, this.broadcastId(value)];
    return [value, null];
  }

  input(expr, slot, parentId) {
    if (expr.kind === 'empty') return null;
    if (expr.kind === 'literal') return [INPUT_SHADOW_ONLY, this.primitive(slot, expr.value)];
    const value =
      expr.kind === 'variable' ? this.variableReporter(expr.name) : this.block(expr, parentId, undefined, true);
    if (slot === 'boolean' || slot === 'argument') return [INPUT_BLOCK_NO_SHADOW, value];
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

function penguinModFields({ returns, color }, isReporter) {
  return {
    ...(isReporter && { returns: 'true', optype: JSON.stringify(returns ?? 'string'), edited: 'true' }),
    ...(color && { color: JSON.stringify(color) }),
  };
}

const findIdByName = (variables, name) =>
  Object.entries(variables).find(([, [variableName]]) => variableName === name)?.[0];
