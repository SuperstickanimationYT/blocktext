import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TextSyntaxError, decode, encode, parse, print } from '../src/index.js';

const SAMPLE = `when flag_clicked:
    score = 0
    \`my speed\` = "fast"
    go_to_xy(-120, 0.5)
    point_in_direction(90)
    forever:
        if (x_position() + 10) * 2 > 240 and not score == 5:
            turn_right(15)
            score += 1
        else:
            move(\`my speed\`)
        repeat(score % 3):
            pass
        repeat_until(_):
            change_x(-5)
            change_y(x_position() - (y_position() - 1))
        wait_until(timer() > 3 or y_position() < 0)
        wait(0.1)
        wait_until(not \`dead?\`)

when key_pressed("space"):
    say(join("score: ", score))
    say_for("", "")
    think(length("hello\\nworld"))
    set_x(random(1, "abc"))
    set_y(1 - 2 - 3)
    broadcast("game over")
    broadcast_and_wait(join("lev", "el"))
    turn_left(direction())

when received("game over"):
    pass

stack:
    \`if\` += 1
`;

const roundTrip = (scripts) => decode(encode(scripts).blocks);

test('canonical text prints back unchanged', () => {
  assert.equal(print(parse(SAMPLE)), SAMPLE);
});

test('text survives text -> blocks -> text', () => {
  assert.equal(print(roundTrip(parse(SAMPLE))), SAMPLE);
});

test('encoded blocks link up consistently', () => {
  const { blocks } = encode(parse(SAMPLE));
  for (const [id, block] of Object.entries(blocks)) {
    if (block.next) assert.equal(blocks[block.next].parent, id);
    if (block.parent) assert.ok(blocks[block.parent], `${id} has a missing parent`);
    assert.equal(block.topLevel, block.parent === null);
    for (const input of Object.values(block.inputs)) {
      if (typeof input[1] === 'string') assert.equal(blocks[input[1]].parent, id);
    }
  }
});

test('existing variables and broadcasts keep their ids', () => {
  const { blocks, variables, broadcasts } = encode(parse('when flag_clicked:\n    score = 1\n    broadcast("go")\n'), {
    variables: { abc: ['score', 0] },
    broadcasts: { xyz: 'go' },
  });
  const [set, send] = Object.values(blocks).slice(1);
  assert.deepEqual(set.fields.VARIABLE, ['score', 'abc']);
  assert.deepEqual(send.inputs.BROADCAST_INPUT, [1, [11, 'go', 'xyz']]);
  assert.deepEqual(variables, { abc: ['score', 0] });
  assert.deepEqual(broadcasts, { xyz: 'go' });
});

const SCRATCH_STYLE_BLOCKS = {
  'h!a': { opcode: 'event_whenflagclicked', next: 'm?b', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 312, y: -40 },
  'm?b': { opcode: 'motion_movesteps', next: 'i%c', parent: 'h!a', inputs: { STEPS: [3, 'add', [4, '10']] }, fields: {}, shadow: false, topLevel: false },
  add: { opcode: 'operator_add', next: null, parent: 'm?b', inputs: { NUM1: [3, [12, 'speed', 'v1'], [4, '']], NUM2: [1, 'shadowNum'] }, fields: {}, shadow: false, topLevel: false },
  shadowNum: { opcode: 'math_number', next: null, parent: 'add', inputs: {}, fields: { NUM: ['7', null] }, shadow: true, topLevel: false },
  'i%c': { opcode: 'control_if_else', next: null, parent: 'm?b', inputs: { CONDITION: [2, 'eq'], SUBSTACK: [2, 'say'] }, fields: {}, shadow: false, topLevel: false },
  eq: { opcode: 'operator_equals', next: null, parent: 'i%c', inputs: { OPERAND1: [3, 'var', [10, '']], OPERAND2: [1, [10, '50']] }, fields: {}, shadow: false, topLevel: false },
  var: { opcode: 'data_variable', next: null, parent: 'eq', inputs: {}, fields: { VARIABLE: ['speed', 'v1'] }, shadow: false, topLevel: false },
  say: { opcode: 'looks_say', next: null, parent: 'i%c', inputs: { MESSAGE: [1, [10, 'Hello!']] }, fields: {}, shadow: false, topLevel: false },
  loose: { opcode: 'control_wait', next: null, parent: null, inputs: { DURATION: [1, [5, '1e3']] }, fields: {}, shadow: false, topLevel: true, x: 0, y: 500 },
};

test('Scratch-style block data survives blocks -> text -> blocks', () => {
  const scripts = decode(SCRATCH_STYLE_BLOCKS);
  assert.equal(
    print(scripts),
    `when flag_clicked:
    move(speed + 7)
    if speed == 50:
        say("Hello!")
    else:
        pass

stack:
    wait("1e3")
`,
  );
  assert.deepEqual(roundTrip(parse(print(scripts))), scripts);
});

const syntaxErrors = {
  'when flag_clicked:\n  move(1)\n move(2)\n': /line 3:1: indentation/,
  'when flag_clicked:\n\tmove(1)\n': /tabs/,
  'when flag_clicked:\n    move(1, 2)\n': /move takes 1 argument$/,
  'when flag_clicked:\n    if 5:\n        pass\n': /true\/false slot takes/,
  'when flag_clicked:\n    move(_)\n': /_ only fills/,
  'when flag_clicked:\n    fly(3)\n': /unknown block "fly"/,
  'when flag_clicked:\n    move(1) # go\n': /comments/,
  'when flag_clicked:\n    wait_until(1 < 2 < 3)\n': /chained comparisons/,
  'when flag_clicked:\n    move(1)\n    pass\n': /"pass" only fills/,
  'move(1)\n': /a script starts with/,
};

for (const [text, message] of Object.entries(syntaxErrors)) {
  test(`rejects ${JSON.stringify(text)}`, () => {
    assert.throws(() => parse(text), (error) => error instanceof TextSyntaxError && message.test(error.message));
  });
}
