import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TextSyntaxError, decode, encode, parse, print } from '../src/index.js';

const SAMPLE = `when flag_clicked:
    hide()
    delete_all_of_list("enemies")
    add_to_list(join("bat", 1), "enemies")
    insert_at_list("slime", 1, "enemies")
    replace_item_of_list("last", "enemies", round(abs(x_position()) / 10))
    delete_of_list(item_number_of_list("bat1", "enemies"), "enemies")
    show_list("enemies")
    hide_list("enemies")
    say(list("enemies"))
    set_size(floor(sqrt(length_of_list("enemies"))) * 10)
    change_size(e_pow(1) - ten_pow(0))
    go_to_front()
    go_to_back()
    switch_costume("idle")
    switch_costume(join("walk", costume_number()))
    think(costume_name())
    create_clone_of("_myself_")
    create_clone_of(item_of_list(1, "enemies"))
    if+ list_contains("enemies", "slime") and is_key_pressed("space"):
        show()
    elif contains("apple", letter_of(2, "pa")):
        stop("this script")
    elif false:
        pass
    else:
        stop("other scripts in sprite")
        set_size(size())
    if+ true:
        stop("all")

when started_as_clone:
    wait_until(not false)
    delete_clones_of("Enemy")
    delete_this_clone()
`;

const roundTrip = (scripts) => decode(encode(scripts).blocks);

test('new blocks print back unchanged', () => {
  assert.equal(print(parse(SAMPLE)), SAMPLE);
});

test('new blocks survive text -> blocks -> text', () => {
  assert.equal(print(roundTrip(parse(SAMPLE))), SAMPLE);
});

test('lists, menus, checkboxes and stop are stored the way Scratch and PenguinMod store them', () => {
  const { blocks, lists } = encode(parse(SAMPLE), { lists: { L1: ['enemies', []] } });
  const all = Object.values(blocks);
  const find = (opcode) => all.find((block) => block.opcode === opcode);
  assert.deepEqual(find('data_addtolist').fields.LIST, ['enemies', 'L1']);
  assert.deepEqual(lists, { L1: ['enemies', []] });
  assert.deepEqual(find('looks_say').inputs.MESSAGE[1], [13, 'enemies', 'L1']);
  const cloneMenu = blocks[find('control_create_clone_of').inputs.CLONE_OPTION[1]];
  assert.deepEqual([cloneMenu.opcode, cloneMenu.fields.CLONE_OPTION[0], cloneMenu.shadow], ['control_create_clone_of_menu', '_myself_', true]);
  assert.deepEqual(find('operator_mathop').fields.OPERATOR, ['abs', null]);
  const stops = all.filter((block) => block.opcode === 'control_stop').map((block) => [block.fields.STOP_OPTION[0], block.mutation.hasnext]);
  assert.deepEqual(stops, [['this script', 'false'], ['other scripts in sprite', 'true'], ['all', 'false']]);
  const expandable = find('control_expandableIf');
  assert.deepEqual(expandable.mutation, { tagName: 'mutation', children: [], branches: '4', 'ends-in-else': 'true' });
  assert.deepEqual(Object.keys(expandable.inputs).sort(), ['BOOL1', 'BOOL2', 'BOOL3', 'SUBSTACK1', 'SUBSTACK2', 'SUBSTACK4']);
  assert.equal(expandable.inputs.BOOL1[0], 3);
  assert.equal(blocks[expandable.inputs.BOOL1[2]].opcode, 'checkbox');
  assert.equal(blocks[expandable.inputs.BOOL3[1]].fields.CHECKBOX[0], 'FALSE');
});

const PENGUINMOD_EXPANDABLE_IF = {
  hat: { opcode: 'event_whenflagclicked', next: 'xif', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
  xif: {
    opcode: 'control_expandableIf', next: null, parent: 'hat', fields: {}, shadow: false, topLevel: false,
    inputs: { BOOL1: [3, [12, 'ready', 'v'], 'cb1'], BOOL2: [1, 'cb2'], SUBSTACK1: [2, 'hide'], SUBSTACK3: [2, 'show'] },
    mutation: { tagName: 'mutation', children: [], branches: '3', 'ends-in-else': 'true' },
  },
  cb1: { opcode: 'checkbox', next: null, parent: 'xif', inputs: {}, fields: { CHECKBOX: ['FALSE', 'junk'] }, shadow: true, topLevel: false },
  cb2: { opcode: 'checkbox', next: null, parent: 'xif', inputs: {}, fields: { CHECKBOX: ['TRUE', 'junk'] }, shadow: true, topLevel: false },
  hide: { opcode: 'looks_hide', next: null, parent: 'xif', inputs: {}, fields: {}, shadow: false, topLevel: false },
  show: { opcode: 'looks_show', next: null, parent: 'xif', inputs: {}, fields: {}, shadow: false, topLevel: false },
};

test('PenguinMod expandable if with checkboxes survives blocks -> text -> blocks', () => {
  const scripts = decode(PENGUINMOD_EXPANDABLE_IF);
  assert.equal(
    print(scripts),
    `when flag_clicked:
    if+ ready:
        hide()
    elif true:
        pass
    else:
        show()
`,
  );
  assert.deepEqual(roundTrip(scripts), scripts);
});

const syntaxErrors = {
  'when flag_clicked:\n    if true:\n        pass\n    elif true:\n        pass\n': /elif only follows if\+/,
  'when flag_clicked:\n    say(true)\n': /true only fills true\/false slots/,
  'when flag_clicked:\n    abs(1)\n': /unknown block "abs"/,
  'when flag_clicked:\n    say(abs(1, 2))\n': /abs takes 1 argument$/,
  'when flag_clicked:\n    add_to_list(1, enemies)\n': /expected "string"/,
  'when flag_clicked:\n    say(list(enemies))\n': /expected "string"/,
};

for (const [text, message] of Object.entries(syntaxErrors)) {
  test(`rejects ${JSON.stringify(text)}`, () => {
    assert.throws(() => parse(text), (error) => error instanceof TextSyntaxError && message.test(error.message));
  });
}
