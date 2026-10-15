import {
  BLOCKS,
  DEFAULT_PROCEDURE_COLOR,
  LIST_CODE,
  STATEMENT_SHAPES,
  VARIABLE_CODE,
  defaultArgument,
  procedureSlots,
} from './spec.js';

export class UnsupportedBlockError extends Error {
  constructor(what) {
    super(`unsupported: ${what}`);
    this.what = what;
  }
}

const INPUT_SHADOW_ONLY = 1;

export function decode(blocks) {
  const decoder = new Decoder(blocks);
  return topLevelIds(blocks).map((id) => decoder.script(id));
}

export function topLevelIds(blocks) {
  return Object.entries(blocks)
    .filter(([, block]) => Array.isArray(block) || (block.topLevel && !block.shadow))
    .map(([id]) => id);
}

export const decodeScript = (blocks, id) => new Decoder(blocks).script(id);

function specFor(block) {
  const spec = BLOCKS[block.opcode];
  if (!spec) throw new UnsupportedBlockError(block.opcode);
  return spec;
}

const isTrue = (flag) => flag === true || flag === 'true';
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

class Decoder {
  constructor(blocks) {
    this.blocks = blocks;
    this.scope = null;
  }

  script(id) {
    const block = this.blocks[id];
    if (Array.isArray(block)) throw new UnsupportedBlockError('loose variable or list reporter');
    const spec = specFor(block);
    if (spec.shape === 'define') return this.define(block);
    if (spec.shape === 'hat') return { hat: this.block(block), body: this.stack(block.next) };
    if (!STATEMENT_SHAPES.has(spec.shape) || isTrue(block.mutation?.returns)) {
      throw new UnsupportedBlockError(`loose reporter ${block.opcode}`);
    }
    return { hat: null, body: this.stack(id) };
  }

  define(block) {
    const { mutation } = this.blocks[block.inputs.custom_block[1]];
    const slots = procedureSlots(mutation.proccode);
    const params = JSON.parse(mutation.argumentnames);
    if (params.length !== slots.length) throw new UnsupportedBlockError('custom block whose inputs do not match its label');
    if (new Set(params).size !== params.length) throw new UnsupportedBlockError('custom block with repeated input names');
    const defaults = JSON.parse(mutation.argumentdefaults ?? '[]').map(String);
    const color = mutation.color ? JSON.parse(mutation.color) : null;
    const define = {
      proccode: mutation.proccode,
      params,
      warp: isTrue(mutation.warp),
      returns: block.opcode === 'procedures_definition_return' ? this.returnType(mutation) : null,
      color: color && !sameList(color, DEFAULT_PROCEDURE_COLOR) ? color : null,
      defaults: defaults.length !== slots.length || sameList(defaults, slots.map(defaultArgument)) ? null : defaults,
    };
    this.scope = Object.fromEntries(params.map((name, index) => [name, slots[index]]));
    const body = this.stack(block.next);
    this.scope = null;
    return { define, body };
  }

  returnType(mutation) {
    const type = mutation.optype ? JSON.parse(mutation.optype) : 'string';
    if (type !== 'string' && type !== 'boolean') throw new UnsupportedBlockError(`custom reporter of type ${type}`);
    return type;
  }

  stack(id) {
    const stack = [];
    for (let block = this.blocks[id]; block; block = this.blocks[block.next]) {
      if (!STATEMENT_SHAPES.has(specFor(block).shape)) throw new UnsupportedBlockError(`${block.opcode} in a stack`);
      stack.push(this.block(block));
    }
    return stack;
  }

  block(block) {
    const spec = specFor(block);
    if (spec.shape === 'call') return this.call(block);
    if (spec.shape === 'argument') return this.argument(block);
    if (spec.shape === 'expandable_if') return this.expandableIf(block);
    const args = {};
    for (const param of spec.params) {
      if (param.kind === 'input') {
        args[param.name] = this.input(block.inputs[param.name], param.slot, param.menu);
      } else if (param.holds === 'variable') {
        args[param.name] = this.variable(block.fields[param.name][0]).name;
      } else {
        args[param.name] = block.fields[param.name][0];
      }
    }
    if (spec.variants && !Object.hasOwn(spec.variants.names, args[spec.variants.param])) {
      throw new UnsupportedBlockError(`${block.opcode} ${args[spec.variants.param]}`);
    }
    const substacks = spec.substacks.map((name) => this.stack(block.inputs[name]?.[1]));
    return { kind: 'block', opcode: block.opcode, args, substacks };
  }

  expandableIf(block) {
    const branches = Number(block.mutation.branches);
    const endsInElse = isTrue(block.mutation['ends-in-else']);
    const conditionCount = branches - (endsInElse ? 1 : 0);
    if (!(conditionCount >= 1)) throw new UnsupportedBlockError('expandable if without a condition');
    const conditions = Array.from({ length: conditionCount }, (_, index) =>
      this.input(block.inputs[`BOOL${index + 1}`], 'boolean'),
    );
    const substacks = Array.from({ length: branches }, (_, index) => this.stack(block.inputs[`SUBSTACK${index + 1}`]?.[1]));
    return { kind: 'block', opcode: block.opcode, conditions, endsInElse, substacks };
  }

  call(block) {
    const { proccode, argumentids } = block.mutation;
    const slots = procedureSlots(proccode);
    const ids = JSON.parse(argumentids);
    if (ids.length !== slots.length) throw new UnsupportedBlockError('custom block call whose inputs do not match its label');
    const args = ids.map((id, index) => this.input(block.inputs[id], slots[index]));
    return { kind: 'block', opcode: 'procedures_call', proccode, args, substacks: [] };
  }

  argument(block) {
    const name = block.fields.VALUE[0];
    if (!this.scope || !Object.hasOwn(this.scope, name)) throw new UnsupportedBlockError('input reporter outside its custom block');
    if ((this.scope[name] === 'boolean') !== (block.opcode === 'argument_reporter_boolean')) {
      throw new UnsupportedBlockError('input reporter of the wrong type');
    }
    return { kind: 'argument', name };
  }

  input(input, slot, menu) {
    if (!input || input[1] === null) return { kind: 'empty' };
    const [state, value] = input;
    if (state === INPUT_SHADOW_ONLY && slot === 'boolean') return this.checkbox(value);
    if (state === INPUT_SHADOW_ONLY && menu) return this.menuValue(value, menu);
    if (state === INPUT_SHADOW_ONLY) return { kind: 'literal', value: this.primitiveText(value) };
    if (Array.isArray(value)) {
      if (value[0] === LIST_CODE) return { kind: 'list', name: value[1] };
      if (value[0] !== VARIABLE_CODE) throw new UnsupportedBlockError(`reporter type ${value[0]}`);
      return this.variable(value[1]);
    }
    const block = this.blocks[value];
    if (block.opcode === 'data_variable') return this.variable(block.fields.VARIABLE[0]);
    if (block.opcode === 'data_listcontents') return { kind: 'list', name: block.fields.LIST[0] };
    return this.block(block);
  }

  variable(name) {
    if (this.scope && Object.hasOwn(this.scope, name)) {
      throw new UnsupportedBlockError('variable with the same name as a custom block input');
    }
    return { kind: 'variable', name };
  }

  checkbox(value) {
    const shadow = typeof value === 'string' && this.blocks[value];
    if (shadow?.opcode !== 'checkbox') throw new UnsupportedBlockError('plain value in a true/false slot');
    return { kind: 'checkbox', value: shadow.fields.CHECKBOX[0] === 'TRUE' };
  }

  menuValue(value, menu) {
    const shadow = typeof value === 'string' && this.blocks[value];
    if (shadow?.opcode !== menu.opcode) throw new UnsupportedBlockError(`menu ${shadow?.opcode ?? 'value'}`);
    return { kind: 'literal', value: String(shadow.fields[menu.field][0]) };
  }

  primitiveText(value) {
    if (Array.isArray(value)) return String(value[1]);
    const shadow = this.blocks[value];
    const field = PRIMITIVE_SHADOW_FIELDS[shadow.opcode];
    if (!field) throw new UnsupportedBlockError(`shadow ${shadow.opcode}`);
    return String(shadow.fields[field][0]);
  }
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
