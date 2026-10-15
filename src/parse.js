import {
  ASSIGN_BY_SYMBOL,
  BLOCKS,
  BUILTIN_NAMES,
  C_BLOCK_BY_NAME,
  DEFAULT_PROCEDURE_COLOR,
  HAT_BY_NAME,
  INFIX_BY_SYMBOL,
  KEYWORDS,
  REPORTER_BY_NAME,
  STATEMENT_BY_NAME,
  defaultArgument,
  procedureSlots,
} from './spec.js';

export class TextSyntaxError extends Error {
  constructor(message, token) {
    super(`line ${token.line}:${token.col}: ${message}`);
    this.line = token.line;
    this.col = token.col;
  }
}

const TOKEN_PATTERNS = [
  ['number', /-?(?:\d+\.?\d*|\.\d+)/y],
  ['string', /"(?:[^"\\]|\\.)*"/y],
  ['quotedName', /`(?:[^`\\]|\\.)*`/y],
  ['name', /[A-Za-z_][A-Za-z0-9_]*/y],
  ['symbol', /==|\+=|->|[-+*/%<>=(),:@]/y],
];

const endsValue = (token) =>
  token &&
  (['number', 'string'].includes(token.type) ||
    (token.type === 'name' && (token.quoted || !['and', 'or', 'not', 'return'].includes(token.value))) ||
    (token.type === 'symbol' && token.value === ')'));

export function tokenize(text) {
  const tokens = [];
  const indents = [0];
  const push = (type, value, line, col, extra = {}) => tokens.push({ type, value, line, col, ...extra });

  text.split(/\r?\n/).forEach((source, index) => {
    const line = index + 1;
    if (source.trim() === '') return;
    const indent = source.match(/^[ \t]*/)[0];
    if (indent.includes('\t')) throw new TextSyntaxError('indent with spaces, not tabs', { line, col: 1 });

    if (indent.length > indents.at(-1)) {
      indents.push(indent.length);
      push('indent', null, line, 1);
    }
    while (indent.length < indents.at(-1)) {
      indents.pop();
      push('dedent', null, line, 1);
    }
    if (indent.length !== indents.at(-1)) {
      throw new TextSyntaxError('indentation does not match any outer block', { line, col: 1 });
    }

    let pos = indent.length;
    while (pos < source.length) {
      if (source[pos] === ' ') {
        pos++;
        continue;
      }
      const col = pos + 1;
      if (source[pos] === '#') throw new TextSyntaxError('comments (#) are not supported yet', { line, col });
      const match = matchToken(source, pos, tokens.at(-1));
      if (!match) throw new TextSyntaxError(`unexpected character ${JSON.stringify(source[pos])}`, { line, col });
      const [type, raw] = match;
      if (type === 'string') push('string', JSON.parse(raw), line, col);
      else if (type === 'quotedName') push('name', raw.slice(1, -1).replace(/\\(.)/g, '$1'), line, col, { quoted: true });
      else push(type, raw, line, col);
      pos += raw.length;
    }
    push('newline', null, line, source.length + 1);
  });

  const end = { line: text.split(/\r?\n/).length, col: 1 };
  for (let i = 1; i < indents.length; i++) push('dedent', null, end.line, end.col);
  push('eof', null, end.line, end.col);
  return tokens;
}

function matchToken(source, pos, previous) {
  for (const [type, pattern] of TOKEN_PATTERNS) {
    if (type === 'number' && source[pos] === '-' && endsValue(previous)) continue;
    pattern.lastIndex = pos;
    const match = pattern.exec(source);
    if (match) return [type, match[0]];
  }
  return null;
}

export function parse(text) {
  return new Parser(tokenize(text)).program();
}

const node = (opcode, args, substacks = []) => ({ kind: 'block', opcode, args, substacks });

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.scope = null;
    this.unquotedCalls = [];
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  next() {
    return this.tokens[this.pos++];
  }

  isKeyword(word, token = this.peek()) {
    return token.type === 'name' && !token.quoted && token.value === word;
  }

  isSymbol(symbol, token = this.peek()) {
    return token.type === 'symbol' && token.value === symbol;
  }

  expect(type, value) {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      const wanted = value ?? type;
      const found = token.value ?? token.type;
      throw new TextSyntaxError(`expected ${JSON.stringify(wanted)} but found ${JSON.stringify(found)}`, token);
    }
    return this.next();
  }

  endHeader() {
    this.expect('symbol', ':');
    this.expect('newline');
  }

  program() {
    const scripts = [];
    while (this.peek().type !== 'eof') scripts.push(this.script());
    const defined = new Set(scripts.filter((script) => script.define).map((script) => script.define.proccode));
    for (const { token, open, count } of this.unquotedCalls) {
      if (!defined.has(token.value)) throw new TextSyntaxError(`unknown block ${JSON.stringify(token.value)}`, token);
      if (count !== 0) throw argumentCountError(token.value, 0, open);
    }
    return scripts;
  }

  script() {
    const decorators = this.decorators();
    const token = this.next();
    if (this.isKeyword('define', token)) return this.define(decorators);
    if (Object.keys(decorators).length > 0) throw new TextSyntaxError('@ lines only go above a define', token);
    if (this.isKeyword('stack', token)) {
      this.endHeader();
      return { hat: null, body: this.body() };
    }
    if (!this.isKeyword('when', token)) throw new TextSyntaxError('a script starts with "when ...:", "define ...:" or "stack:"', token);
    const nameToken = this.expect('name');
    const opcode = HAT_BY_NAME[nameToken.value];
    if (!opcode) throw new TextSyntaxError(`unknown event ${JSON.stringify(nameToken.value)}`, nameToken);
    const hat = this.call(opcode, { isHeader: true });
    this.endHeader();
    return { hat, body: this.body() };
  }

  decorators() {
    const decorators = {};
    while (this.isSymbol('@')) {
      this.next();
      const name = this.expect('name');
      if (!['color', 'defaults'].includes(name.value)) throw new TextSyntaxError(`unknown @${name.value}; use @color or @defaults`, name);
      if (decorators[name.value]) throw new TextSyntaxError(`@${name.value} appears twice`, name);
      this.expect('symbol', '(');
      const values = [];
      while (!this.isSymbol(')')) {
        if (values.length > 0) this.expect('symbol', ',');
        values.push(this.expect('string').value);
      }
      this.next();
      this.expect('newline');
      decorators[name.value] = { values, token: name };
    }
    return decorators;
  }

  define(decorators) {
    const warp = this.isKeyword('warp') && !this.isSymbol('(', this.peek(1));
    if (warp) this.next();
    const nameToken = this.expect('name');
    const proccode = nameToken.value;
    if (!nameToken.quoted && (BUILTIN_NAMES.has(proccode) || KEYWORDS.has(proccode))) {
      throw new TextSyntaxError(`"${proccode}" is already a block; name it \`${proccode}\``, nameToken);
    }
    const params = this.paramNames();
    const slots = procedureSlots(proccode);
    if (params.length !== slots.length) {
      throw new TextSyntaxError(`the label has ${slots.length} inputs (%s, %n, %b) but ${params.length} names`, nameToken);
    }

    let returns = null;
    if (this.isSymbol('->')) {
      this.next();
      const type = this.expect('name');
      if (!['string', 'boolean'].includes(type.value)) throw new TextSyntaxError('a custom reporter returns string or boolean', type);
      returns = type.value;
    }
    this.endHeader();

    const defaults = decorators.defaults?.values ?? slots.map(defaultArgument);
    if (defaults.length !== slots.length) {
      throw new TextSyntaxError(`@defaults needs ${slots.length} values`, decorators.defaults.token);
    }
    const color = decorators.color?.values ?? DEFAULT_PROCEDURE_COLOR;

    this.scope = new Map(params.map((name, index) => [name, slots[index]]));
    const body = this.body();
    this.scope = null;
    const define = {
      proccode,
      params,
      warp,
      returns,
      color: sameList(color, DEFAULT_PROCEDURE_COLOR) ? null : color,
      defaults: sameList(defaults, slots.map(defaultArgument)) ? null : defaults,
    };
    return { define, body };
  }

  paramNames() {
    this.expect('symbol', '(');
    const names = [];
    while (!this.isSymbol(')')) {
      if (names.length > 0) this.expect('symbol', ',');
      const token = this.expect('name');
      if (!token.quoted && KEYWORDS.has(token.value)) throw new TextSyntaxError(`quote an input named ${token.value} as \`${token.value}\``, token);
      if (names.includes(token.value)) throw new TextSyntaxError(`input ${JSON.stringify(token.value)} appears twice`, token);
      names.push(token.value);
    }
    this.next();
    return names;
  }

  body() {
    this.expect('indent');
    if (this.isKeyword('pass') && this.peek(1).type === 'newline' && this.peek(2).type === 'dedent') {
      this.pos += 3;
      return [];
    }
    const stack = [];
    while (this.peek().type !== 'dedent') stack.push(this.statement());
    this.next();
    return stack;
  }

  statement() {
    const token = this.next();
    if (token.type !== 'name') throw new TextSyntaxError('expected a block', token);
    if (this.isKeyword('pass', token)) throw new TextSyntaxError('"pass" only fills an otherwise empty block', token);

    if (this.isKeyword('if', token)) {
      const condition = this.slot('boolean');
      this.endHeader();
      const then = this.body();
      if (!this.isKeyword('else')) return node('control_if', { CONDITION: condition }, [then]);
      this.next();
      this.endHeader();
      return node('control_if_else', { CONDITION: condition }, [then, this.body()]);
    }

    if (this.isKeyword('return', token)) {
      const value = this.slot('text');
      this.expect('newline');
      return node('procedures_return', { return: value });
    }
    if (!token.quoted && KEYWORDS.has(token.value)) throw new TextSyntaxError(`unexpected "${token.value}"`, token);

    const assignOpcode = this.peek().type === 'symbol' && ASSIGN_BY_SYMBOL[this.peek().value];
    if (assignOpcode && this.scope?.has(token.value)) {
      if (assignOpcode !== 'data_setvariableto') throw new TextSyntaxError('custom block inputs can only be set with =', this.peek());
      this.next();
      const value = this.slot('text');
      this.expect('newline');
      return node('procedures_set', { PARAM: { kind: 'argument', name: token.value }, VALUE: value });
    }
    if (assignOpcode) {
      this.next();
      const value = this.slot(BLOCKS[assignOpcode].params[1].slot);
      this.expect('newline');
      return node(assignOpcode, { VARIABLE: token.value, VALUE: value });
    }

    const cOpcode = !token.quoted && C_BLOCK_BY_NAME[token.value];
    if (cOpcode) {
      const header = this.call(cOpcode, { isHeader: true });
      this.endHeader();
      return { ...header, substacks: [this.body()] };
    }

    const opcode = !token.quoted && STATEMENT_BY_NAME[token.value];
    if (!opcode && !this.isSymbol('(')) throw new TextSyntaxError(`unknown block ${JSON.stringify(token.value)}`, token);
    const statement = opcode ? this.call(opcode, { isHeader: false }) : this.customCall(token);
    this.expect('newline');
    return statement;
  }

  customCall(nameToken) {
    const proccode = nameToken.value;
    const slots = procedureSlots(proccode);
    const open = this.expect('symbol', '(');
    const args = [];
    while (!this.isSymbol(')')) {
      if (args.length > 0) this.expect('symbol', ',');
      args.push(this.slot(slots[args.length] ?? 'text'));
    }
    this.next();
    if (nameToken.quoted && args.length !== slots.length) throw argumentCountError(proccode, slots.length, open);
    if (!nameToken.quoted) this.unquotedCalls.push({ token: nameToken, open, count: args.length });
    return { kind: 'block', opcode: 'procedures_call', proccode, args, substacks: [] };
  }

  call(opcode, { isHeader }) {
    const spec = BLOCKS[opcode];
    const args = {};
    if (spec.params.length === 0 && isHeader && !this.isSymbol('(')) return node(opcode, args);

    const open = this.expect('symbol', '(');
    spec.params.forEach((param, index) => {
      if (index > 0) {
        if (!this.isSymbol(',')) throw argumentCountError(spec.name, spec.params.length, open);
        this.next();
      }
      args[param.name] = param.kind === 'field' ? this.expect('string').value : this.slot(param.slot);
    });
    if (!this.isSymbol(')')) throw argumentCountError(spec.name, spec.params.length, open);
    this.next();
    return node(opcode, args);
  }

  slot(slot) {
    const start = this.peek();
    const expr = this.or();
    checkSlot(expr, slot, start);
    return expr;
  }

  or() {
    return this.leftAssociative(() => this.and(), (token) => this.isKeyword('or', token) && 'operator_or');
  }

  and() {
    return this.leftAssociative(() => this.not(), (token) => this.isKeyword('and', token) && 'operator_and');
  }

  not() {
    if (!this.isKeyword('not')) return this.comparison();
    this.next();
    const start = this.peek();
    const operand = this.not();
    checkSlot(operand, 'boolean', start);
    return node('operator_not', { OPERAND: operand });
  }

  comparison() {
    const start = this.peek();
    const left = this.additive();
    const opcode = this.comparisonOpcode();
    if (!opcode) return left;
    this.next();
    const right = this.additive();
    if (this.comparisonOpcode()) throw new TextSyntaxError('wrap chained comparisons in parentheses', this.peek());
    return infix(opcode, left, right, start);
  }

  comparisonOpcode() {
    const token = this.peek();
    return token.type === 'symbol' && ['<', '>', '=='].includes(token.value) && INFIX_BY_SYMBOL[token.value];
  }

  additive() {
    return this.leftAssociative(() => this.multiplicative(), (token) => this.symbolOpcode(token, ['+', '-']));
  }

  multiplicative() {
    return this.leftAssociative(() => this.primary(), (token) => this.symbolOpcode(token, ['*', '/', '%']));
  }

  symbolOpcode(token, symbols) {
    return token.type === 'symbol' && symbols.includes(token.value) && INFIX_BY_SYMBOL[token.value];
  }

  leftAssociative(operand, opcodeOf) {
    const start = this.peek();
    let left = operand();
    for (let opcode = opcodeOf(this.peek()); opcode; opcode = opcodeOf(this.peek())) {
      this.next();
      left = infix(opcode, left, operand(), start);
    }
    return left;
  }

  primary() {
    const token = this.next();
    if (token.type === 'number' || token.type === 'string') return { kind: 'literal', value: token.value };
    if (this.isSymbol('(', token)) {
      const expr = this.or();
      this.expect('symbol', ')');
      return expr;
    }
    if (token.type !== 'name') throw new TextSyntaxError(`expected a value but found ${JSON.stringify(token.value ?? token.type)}`, token);
    if (this.isKeyword('_', token)) return { kind: 'empty' };
    if (!token.quoted && KEYWORDS.has(token.value)) {
      throw new TextSyntaxError(`"${token.value}" is a keyword; quote a variable with that name as \`${token.value}\``, token);
    }
    if (this.isSymbol('(')) {
      const opcode = !token.quoted && REPORTER_BY_NAME[token.value];
      return opcode ? this.call(opcode, { isHeader: false }) : this.customCall(token);
    }
    if (this.scope?.has(token.value)) return { kind: 'argument', name: token.value };
    return { kind: 'variable', name: token.value };
  }
}

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const argumentCountError = (name, count, token) =>
  new TextSyntaxError(`${name} takes ${count} argument${count === 1 ? '' : 's'}`, token);

function infix(opcode, left, right, start) {
  const spec = BLOCKS[opcode];
  checkSlot(left, spec.operand, start);
  checkSlot(right, spec.operand, start);
  const [first, second] = spec.params;
  return node(opcode, { [first.name]: left, [second.name]: right });
}

function checkSlot(expr, slot, token) {
  if (slot === 'boolean') {
    if (expr.kind === 'literal') throw new TextSyntaxError('a true/false slot takes a condition or reporter, not a plain value', token);
  } else if (expr.kind === 'empty') {
    throw new TextSyntaxError('_ only fills true/false slots; use "" for an empty value', token);
  }
}
