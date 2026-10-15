import { BLOCKS, KEYWORDS, isNonAssociative } from './spec.js';

const INDENT = '    ';
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

export function print(scripts) {
  return scripts.map(printScript).join('\n');
}

function printScript({ hat, body }) {
  const header = hat ? `when ${printHeader(hat)}:` : 'stack:';
  return [header, ...printBody(body, 1)].join('\n') + '\n';
}

function printBody(stack, depth) {
  if (stack.length === 0) return [INDENT.repeat(depth) + 'pass'];
  return stack.flatMap((node) => printStatement(node, depth));
}

function printStatement(node, depth) {
  const spec = BLOCKS[node.opcode];
  const pad = INDENT.repeat(depth);
  const [first, second] = spec.params;
  switch (spec.shape) {
    case 'assign':
      return [`${pad}${printIdentifier(node.args[first.name])} ${spec.symbol} ${printSlot(node.args[second.name], second.slot)}`];
    case 'if': {
      const lines = [`${pad}if ${printSlot(node.args.CONDITION, 'boolean')}:`, ...printBody(node.substacks[0], depth + 1)];
      if (node.substacks.length === 2) lines.push(`${pad}else:`, ...printBody(node.substacks[1], depth + 1));
      return lines;
    }
    case 'c':
      return [`${pad}${printHeader(node)}:`, ...printBody(node.substacks[0], depth + 1)];
    default:
      return [pad + printCall(node)];
  }
}

function printHeader(node) {
  return BLOCKS[node.opcode].params.length === 0 ? BLOCKS[node.opcode].name : printCall(node);
}

function printCall(node) {
  const spec = BLOCKS[node.opcode];
  const args = spec.params.map((param) =>
    param.kind === 'field' ? JSON.stringify(node.args[param.name]) : printSlot(node.args[param.name], param.slot),
  );
  return `${spec.name}(${args.join(', ')})`;
}

function printSlot(expr, slot, minPrecedence = 0) {
  switch (expr.kind) {
    case 'empty':
      return '_';
    case 'literal':
      return slot !== 'broadcast' && PLAIN_NUMBER.test(expr.value) ? expr.value : JSON.stringify(expr.value);
    case 'variable':
      return printIdentifier(expr.name);
    default:
      return printExpression(expr, minPrecedence);
  }
}


function printExpression(node, minPrecedence) {
  const spec = BLOCKS[node.opcode];
  if (spec.shape === 'reporter') return printCall(node);
  const [left, right] = spec.params;
  const precedence = spec.precedence;
  const text =
    spec.shape === 'prefix'
      ? `not ${printSlot(node.args[left.name], left.slot, precedence)}`
      : `${printSlot(node.args[left.name], left.slot, isNonAssociative(spec) ? precedence + 1 : precedence)} ${spec.symbol} ${printSlot(node.args[right.name], right.slot, precedence + 1)}`;
  return precedence < minPrecedence ? `(${text})` : text;
}

export function printIdentifier(name) {
  if (IDENTIFIER.test(name) && !KEYWORDS.has(name)) return name;
  return '`' + name.replace(/[\\`]/g, (c) => '\\' + c) + '`';
}
