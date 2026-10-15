import { BLOCKS, BUILTIN_NAMES, KEYWORDS, isNonAssociative, procedureSlots } from './spec.js';

const INDENT = '    ';
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

export function print(scripts) {
  const defined = new Set(scripts.filter((script) => script.define).map((script) => script.define.proccode));
  const printer = new Printer(defined);
  return scripts.map((script) => printer.script(script)).join('\n');
}

export function printIdentifier(name) {
  if (IDENTIFIER.test(name) && !KEYWORDS.has(name)) return name;
  return quote(name);
}

const quote = (name) => '`' + name.replace(/[\\`]/g, (c) => '\\' + c) + '`';

const printStrings = (values) => values.map((value) => JSON.stringify(value)).join(', ');

class Printer {
  constructor(defined) {
    this.defined = defined;
  }

  script({ hat, define, body }) {
    const header = define ? this.defineHeader(define) : hat ? [`when ${this.header(hat)}:`] : ['stack:'];
    return [...header, ...this.body(body, 1)].join('\n') + '\n';
  }

  defineHeader({ proccode, params, warp, returns, color, defaults }) {
    const lines = [];
    if (color) lines.push(`@color(${printStrings(color)})`);
    if (defaults) lines.push(`@defaults(${printStrings(defaults)})`);
    const modifier = warp ? 'warp ' : '';
    const result = returns ? ` -> ${returns}` : '';
    lines.push(`define ${modifier}${this.procedureName(proccode)}(${params.map(printIdentifier).join(', ')})${result}:`);
    return lines;
  }

  procedureName(proccode) {
    const plain = IDENTIFIER.test(proccode) && !KEYWORDS.has(proccode) && !BUILTIN_NAMES.has(proccode);
    return plain && this.defined.has(proccode) ? proccode : quote(proccode);
  }

  body(stack, depth) {
    if (stack.length === 0) return [INDENT.repeat(depth) + 'pass'];
    return stack.flatMap((node) => this.statement(node, depth));
  }

  statement(node, depth) {
    const spec = BLOCKS[node.opcode];
    const pad = INDENT.repeat(depth);
    const [first, second] = spec.params;
    switch (spec.shape) {
      case 'assign':
        return [`${pad}${printIdentifier(node.args[first.name])} ${spec.symbol} ${this.slot(node.args[second.name], second.slot)}`];
      case 'set_argument':
        return [`${pad}${printIdentifier(node.args.PARAM.name)} = ${this.slot(node.args.VALUE, 'text')}`];
      case 'return':
        return [`${pad}return ${this.slot(node.args.return, 'text')}`];
      case 'if': {
        const lines = [`${pad}if ${this.slot(node.args.CONDITION, 'boolean')}:`, ...this.body(node.substacks[0], depth + 1)];
        if (node.substacks.length === 2) lines.push(`${pad}else:`, ...this.body(node.substacks[1], depth + 1));
        return lines;
      }
      case 'c':
        return [`${pad}${this.header(node)}:`, ...this.body(node.substacks[0], depth + 1)];
      default:
        return [pad + this.call(node)];
    }
  }

  header(node) {
    return BLOCKS[node.opcode].params.length === 0 ? BLOCKS[node.opcode].name : this.call(node);
  }

  call(node) {
    if (node.opcode === 'procedures_call') {
      const slots = procedureSlots(node.proccode);
      const args = node.args.map((arg, index) => this.slot(arg, slots[index]));
      return `${this.procedureName(node.proccode)}(${args.join(', ')})`;
    }
    const spec = BLOCKS[node.opcode];
    const args = spec.params.map((param) =>
      param.kind === 'field' ? JSON.stringify(node.args[param.name]) : this.slot(node.args[param.name], param.slot),
    );
    return `${spec.name}(${args.join(', ')})`;
  }

  slot(expr, slot, minPrecedence = 0) {
    switch (expr.kind) {
      case 'empty':
        return '_';
      case 'literal':
        return slot !== 'broadcast' && PLAIN_NUMBER.test(expr.value) ? expr.value : JSON.stringify(expr.value);
      case 'variable':
      case 'argument':
        return printIdentifier(expr.name);
      default:
        return this.expression(expr, minPrecedence);
    }
  }

  expression(node, minPrecedence) {
    const spec = BLOCKS[node.opcode];
    if (spec.shape === 'reporter' || spec.shape === 'call') return this.call(node);
    const [left, right] = spec.params;
    const precedence = spec.precedence;
    const text =
      spec.shape === 'prefix'
        ? `not ${this.slot(node.args[left.name], left.slot, precedence)}`
        : `${this.slot(node.args[left.name], left.slot, isNonAssociative(spec) ? precedence + 1 : precedence)} ${spec.symbol} ${this.slot(node.args[right.name], right.slot, precedence + 1)}`;
    return precedence < minPrecedence ? `(${text})` : text;
  }
}
