import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyText, openProjectFile, saveProjectFile, targetToText } from '../src/index.js';
import { crc32, deflatedEntry, entryBytes, readZip, writeZip } from '../src/zip.js';

const bytes = (text) => new TextEncoder().encode(text);
const text = (data) => new TextDecoder().decode(data);

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
});

test('zip entries survive write and read', async () => {
  const stored = { name: 'ünïcode.txt', method: 0, time: 0, date: 0, crc: crc32(bytes('plain')), size: 5, data: bytes('plain') };
  const zip = writeZip([await deflatedEntry('a.json', bytes('{"x":1}'.repeat(50))), stored]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((entry) => entry.name), ['a.json', 'ünïcode.txt']);
  assert.equal(text(await entryBytes(entries[0])), '{"x":1}'.repeat(50));
  assert.equal(text(await entryBytes(entries[1])), 'plain');
});

const sprite = () => ({
  isStage: false,
  name: 'Cat',
  variables: { v1: ['score', 0] },
  comments: {
    c1: { blockId: 'say', x: 5, y: 5, text: 'on a converted block' },
    c2: { blockId: 'hide', x: 9, y: 9, text: 'on a kept block' },
  },
  blocks: {
    flag: { opcode: 'event_whenflagclicked', next: 'say', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
    say: { opcode: 'looks_say', next: null, parent: 'flag', inputs: { MESSAGE: [1, [10, 'hi']] }, fields: {}, shadow: false, topLevel: false },
    click: { opcode: 'event_whenthisspriteclicked', next: 'hide', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 400, y: 0 },
    hide: { opcode: 'looks_hide', next: null, parent: 'click', inputs: {}, fields: {}, shadow: false, topLevel: false },
  },
});
const stage = { isStage: true, name: 'Stage', variables: {}, broadcasts: {}, blocks: {}, comments: {} };

test('unsupported scripts are kept untouched while text replaces the rest', () => {
  const target = sprite();
  const split = targetToText(target);
  assert.equal(split.text, 'when flag_clicked:\n    say("hi")\n');
  assert.deepEqual(split.kept, [{ id: 'click', reason: 'event_whenthisspriteclicked' }]);

  const result = applyText(target, 'when flag_clicked:\n    say("bye")\n    score += 1\n', { ...split, stage });
  assert.deepEqual(result.blocks.click, target.blocks.click);
  assert.deepEqual(result.blocks.hide, target.blocks.hide);
  assert.equal(result.blocks.say, undefined);
  const said = Object.values(result.blocks).find((block) => block.opcode === 'looks_say');
  assert.deepEqual(said.inputs.MESSAGE, [1, [10, 'bye']]);
  assert.ok(Object.values(result.blocks).find((block) => block.opcode === 'event_whenflagclicked').x > 400);
  assert.deepEqual(result.variables, { v1: ['score', 0] });
  assert.equal(result.comments.c1.blockId, null);
  assert.equal(result.comments.c2.blockId, 'hide');
});

test('calls to a kept custom block reuse its argument ids', () => {
  const target = sprite();
  target.blocks.def = { opcode: 'procedures_definition', next: 'hide2', parent: null, inputs: { custom_block: [1, 'proto'] }, fields: {}, shadow: false, topLevel: true, x: 0, y: 900 };
  target.blocks.proto = {
    opcode: 'procedures_prototype', next: null, parent: 'def', inputs: { argX: [1, 'rep'] }, fields: {}, shadow: true, topLevel: false,
    mutation: { tagName: 'mutation', children: [], proccode: 'hop %s', argumentids: '["argX"]', argumentnames: '["h"]', argumentdefaults: '[""]', warp: 'false' },
  };
  target.blocks.rep = { opcode: 'argument_reporter_string_number', next: null, parent: 'proto', inputs: {}, fields: { VALUE: ['h', null] }, shadow: true, topLevel: false };
  target.blocks.hide2 = { opcode: 'looks_hide', next: null, parent: 'def', inputs: {}, fields: {}, shadow: false, topLevel: false };

  const split = targetToText(target);
  const result = applyText(target, 'when flag_clicked:\n    `hop %s`(3)\n', { ...split, stage });
  const call = Object.values(result.blocks).find((block) => block.opcode === 'procedures_call');
  assert.equal(call.mutation.argumentids, '["argX"]');
  assert.deepEqual(call.inputs.argX, [1, [10, '3']]);
});

test('sb3 files keep their assets through open and save', async () => {
  const project = { targets: [stage], meta: { semver: '3.0.0' } };
  const asset = { name: 'cat.svg', method: 0, time: 0, date: 0, crc: crc32(bytes('<svg/>')), size: 6, data: bytes('<svg/>') };
  const file = writeZip([await deflatedEntry('project.json', bytes(JSON.stringify(project))), asset]);
  const opened = await openProjectFile(file);
  assert.deepEqual(opened.project, project);
  const saved = readZip(await saveProjectFile(opened.project, opened.entries));
  assert.equal(text(await entryBytes(saved.find((entry) => entry.name === 'cat.svg'))), '<svg/>');
});

test('plain project.json files open and save as JSON', async () => {
  const opened = await openProjectFile(bytes('{"targets":[]}'));
  assert.equal(opened.entries, null);
  assert.equal(text(await saveProjectFile(opened.project, opened.entries)), '{"targets":[]}');
});
