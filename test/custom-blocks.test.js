import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TextSyntaxError, decode, encode, parse, print } from '../src/index.js';

const SAMPLE = `define \`jump %s high %b\`(height, fast):
    change_y(height)
    if fast:
        height = height * 2
    \`jump %s high %b\`(height - 1, not fast)

@color("#4C97FF", "#4488e6", "#3d79cc")
@defaults("0", "1")
define warp \`distance to %n %n\`(x, y) -> string:
    return x * x + y * y

define is_ready() -> boolean:
    return timer() > 1

define \`move\`():
    pass

when flag_clicked:
    reset()
    \`jump %s high %b\`(10, is_ready())
    say(\`distance to %n %n\`(3, 4))
    \`move\`()
    \`deleted block %s\`("orphan")

define reset():
    x = 0
`;

const roundTrip = (scripts) => decode(encode(scripts).blocks);

test('custom block text prints back unchanged', () => {
  assert.equal(print(parse(SAMPLE)), SAMPLE);
});

test('custom block text survives text -> blocks -> text', () => {
  assert.equal(print(roundTrip(parse(SAMPLE))), SAMPLE);
});

test('calls share argument ids with their define', () => {
  const { blocks } = encode(parse(SAMPLE));
  const prototypes = Object.values(blocks).filter((block) => block.opcode === 'procedures_prototype');
  const idsByProccode = Object.fromEntries(prototypes.map(({ mutation }) => [mutation.proccode, mutation.argumentids]));
  for (const block of Object.values(blocks)) {
    if (block.opcode !== 'procedures_call' || !(block.mutation.proccode in idsByProccode)) continue;
    assert.equal(block.mutation.argumentids, idsByProccode[block.mutation.proccode]);
    for (const id of Object.keys(block.inputs)) assert.ok(JSON.parse(block.mutation.argumentids).includes(id));
  }
});

test('reporter custom blocks carry PenguinMod return fields', () => {
  const { blocks } = encode(parse(SAMPLE));
  const reporterCall = Object.values(blocks).find(
    (block) => block.opcode === 'procedures_call' && block.mutation.proccode === 'distance to %n %n',
  );
  assert.equal(reporterCall.mutation.returns, 'true');
  assert.equal(reporterCall.mutation.optype, '"string"');
  assert.equal(reporterCall.mutation.warp, 'true');
  assert.equal(reporterCall.mutation.color, '["#4C97FF","#4488e6","#3d79cc"]');
});

const mutation = (fields) => ({ tagName: 'mutation', children: [], ...fields });
const PENGUINMOD_STYLE_BLOCKS = {
  def: { opcode: 'procedures_definition_return', next: 'set', parent: null, inputs: { custom_block: [1, 'proto'] }, fields: {}, shadow: false, topLevel: true, x: 10, y: 10 },
  proto: {
    opcode: 'procedures_prototype', next: null, parent: 'def', inputs: { 'a~1': [1, 'argA'], 'b`2': [1, 'argB'] }, fields: {}, shadow: true, topLevel: false,
    mutation: mutation({
      proccode: 'clamp %s above %b', argumentids: '["a~1","b`2"]', argumentnames: '["value","on"]', argumentdefaults: '["",""]',
      warp: true, returns: 'true', edited: 'true', optype: '"boolean"', color: '["#FF6680","#FF4D6A","#FF3355"]',
    }),
  },
  argA: { opcode: 'argument_reporter_string_number', next: null, parent: 'proto', inputs: {}, fields: { VALUE: ['value', 'junk'] }, shadow: true, topLevel: false },
  argB: { opcode: 'argument_reporter_boolean', next: null, parent: 'proto', inputs: {}, fields: { VALUE: ['on', 'junk'] }, shadow: true, topLevel: false },
  set: { opcode: 'procedures_set', next: 'ret', parent: 'def', inputs: { PARAM: [2, 'useA'], VALUE: [1, [10, 0]] }, fields: {}, shadow: false, topLevel: false },
  useA: { opcode: 'argument_reporter_string_number', next: null, parent: 'set', inputs: {}, fields: { VALUE: ['value', null] }, shadow: false, topLevel: false },
  ret: { opcode: 'procedures_return', next: null, parent: 'set', inputs: { return: [3, 'useB', [10, '1']] }, fields: {}, shadow: false, topLevel: false },
  useB: { opcode: 'argument_reporter_boolean', next: null, parent: 'ret', inputs: {}, fields: { VALUE: ['on', null] }, shadow: false, topLevel: false },
  call: {
    opcode: 'procedures_call', next: null, parent: null, inputs: { 'a~1': [1, [4, '5']] }, fields: {}, shadow: false, topLevel: true, x: 0, y: 300,
    mutation: mutation({ proccode: 'clamp %s above %b', argumentids: '["a~1","b`2"]', warp: 'true' }),
  },
};

test('PenguinMod-style custom blocks survive blocks -> text -> blocks', () => {
  const scripts = decode(PENGUINMOD_STYLE_BLOCKS);
  assert.equal(
    print(scripts),
    `@defaults("", "")
define warp \`clamp %s above %b\`(value, on) -> boolean:
    value = 0
    return on

stack:
    \`clamp %s above %b\`(5, _)
`,
  );
  assert.deepEqual(roundTrip(parse(print(scripts))), scripts);
});

const syntaxErrors = {
  'define `a %s`(x, y):\n    pass\n': /label has 1 inputs .* but 2 names/,
  'define `a %s %s`(x, x):\n    pass\n': /input "x" appears twice/,
  'define move():\n    pass\n': /"move" is already a block/,
  'define `a %s`(x) -> number:\n    pass\n': /returns string or boolean/,
  'define `a %s`(x):\n    x += 1\n': /only be set with =/,
  '@defaults("1", "2")\ndefine `a %s`(x):\n    pass\n': /@defaults needs 1 values/,
  '@color("#fff")\nwhen flag_clicked:\n    pass\n': /only go above a define/,
  '@size(2)\ndefine a():\n    pass\n': /unknown @size/,
  'when flag_clicked:\n    `a %s`(1, 2)\n': /a %s takes 1 argument$/,
  'when flag_clicked:\n    jump(1)\ndefine jump():\n    pass\n': /jump takes 0 arguments/,
  'when flag_clicked:\n    say(jump())\n': /unknown block "jump"/,
};

for (const [text, message] of Object.entries(syntaxErrors)) {
  test(`rejects ${JSON.stringify(text)}`, () => {
    assert.throws(() => parse(text), (error) => error instanceof TextSyntaxError && message.test(error.message));
  });
}
