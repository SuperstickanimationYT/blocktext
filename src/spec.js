export const PRIMITIVE_CODES = {
  number: 4,
  positive: 5,
  whole: 6,
  integer: 7,
  angle: 8,
  text: 10,
  broadcast: 11,
};
export const VARIABLE_CODE = 12;
export const LIST_CODE = 13;

const input = (name, slot) => ({ kind: 'input', name, slot });
const field = (name, holds = 'string') => ({ kind: 'field', name, holds });
const menu = (name, opcode, menuField, fallback) => ({
  kind: 'input',
  name,
  slot: 'menu',
  menu: { opcode, field: menuField, fallback },
});
const LIST = field('LIST', 'list');
const CLONE_MENU = menu('CLONE_OPTION', 'control_create_clone_of_menu', 'CLONE_OPTION', '_myself_');

const MATH_FUNCTIONS = {
  abs: 'abs',
  floor: 'floor',
  ceiling: 'ceiling',
  sqrt: 'sqrt',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  asin: 'asin',
  acos: 'acos',
  atan: 'atan',
  ln: 'ln',
  log: 'log',
  'e ^': 'e_pow',
  '10 ^': 'ten_pow',
};

export const BLOCKS = {
  event_whenflagclicked: { shape: 'hat', name: 'flag_clicked', params: [] },
  event_whenkeypressed: { shape: 'hat', name: 'key_pressed', params: [field('KEY_OPTION')] },
  event_whenbroadcastreceived: {
    shape: 'hat',
    name: 'received',
    params: [field('BROADCAST_OPTION', 'broadcast')],
  },

  motion_movesteps: { shape: 'stack', name: 'move', params: [input('STEPS', 'number')] },
  motion_turnright: { shape: 'stack', name: 'turn_right', params: [input('DEGREES', 'number')] },
  motion_turnleft: { shape: 'stack', name: 'turn_left', params: [input('DEGREES', 'number')] },
  motion_gotoxy: { shape: 'stack', name: 'go_to_xy', params: [input('X', 'number'), input('Y', 'number')] },
  motion_pointindirection: { shape: 'stack', name: 'point_in_direction', params: [input('DIRECTION', 'angle')] },
  motion_changexby: { shape: 'stack', name: 'change_x', params: [input('DX', 'number')] },
  motion_setx: { shape: 'stack', name: 'set_x', params: [input('X', 'number')] },
  motion_changeyby: { shape: 'stack', name: 'change_y', params: [input('DY', 'number')] },
  motion_sety: { shape: 'stack', name: 'set_y', params: [input('Y', 'number')] },
  looks_say: { shape: 'stack', name: 'say', params: [input('MESSAGE', 'text')] },
  looks_sayforsecs: { shape: 'stack', name: 'say_for', params: [input('MESSAGE', 'text'), input('SECS', 'number')] },
  looks_think: { shape: 'stack', name: 'think', params: [input('MESSAGE', 'text')] },
  control_wait: { shape: 'stack', name: 'wait', params: [input('DURATION', 'positive')] },
  control_wait_until: { shape: 'stack', name: 'wait_until', params: [input('CONDITION', 'boolean')] },
  event_broadcast: { shape: 'stack', name: 'broadcast', params: [input('BROADCAST_INPUT', 'broadcast')] },
  event_broadcastandwait: {
    shape: 'stack',
    name: 'broadcast_and_wait',
    params: [input('BROADCAST_INPUT', 'broadcast')],
  },
  data_setvariableto: {
    shape: 'assign',
    symbol: '=',
    params: [field('VARIABLE', 'variable'), input('VALUE', 'text')],
  },
  data_changevariableby: {
    shape: 'assign',
    symbol: '+=',
    params: [field('VARIABLE', 'variable'), input('VALUE', 'number')],
  },

  data_addtolist: { shape: 'stack', name: 'add_to_list', params: [input('ITEM', 'text'), LIST] },
  data_deleteoflist: { shape: 'stack', name: 'delete_of_list', params: [input('INDEX', 'integer'), LIST] },
  data_deletealloflist: { shape: 'stack', name: 'delete_all_of_list', params: [LIST] },
  data_insertatlist: {
    shape: 'stack',
    name: 'insert_at_list',
    params: [input('ITEM', 'text'), input('INDEX', 'integer'), LIST],
  },
  data_replaceitemoflist: {
    shape: 'stack',
    name: 'replace_item_of_list',
    params: [input('INDEX', 'integer'), LIST, input('ITEM', 'text')],
  },
  data_showlist: { shape: 'stack', name: 'show_list', params: [LIST] },
  data_hidelist: { shape: 'stack', name: 'hide_list', params: [LIST] },

  control_stop: {
    shape: 'stack',
    name: 'stop',
    params: [field('STOP_OPTION')],
    mutation: ({ STOP_OPTION }) => ({ hasnext: String(STOP_OPTION.startsWith('other scripts')) }),
  },
  looks_switchcostumeto: {
    shape: 'stack',
    name: 'switch_costume',
    params: [menu('COSTUME', 'looks_costume', 'COSTUME', '')],
  },
  looks_hide: { shape: 'stack', name: 'hide', params: [] },
  looks_show: { shape: 'stack', name: 'show', params: [] },
  looks_setsizeto: { shape: 'stack', name: 'set_size', params: [input('SIZE', 'number')] },
  looks_changesizeby: { shape: 'stack', name: 'change_size', params: [input('CHANGE', 'number')] },
  looks_gotofrontback: {
    shape: 'stack',
    params: [field('FRONT_BACK')],
    variants: { param: 'FRONT_BACK', names: { front: 'go_to_front', back: 'go_to_back' } },
  },

  control_create_clone_of: { shape: 'stack', name: 'create_clone_of', params: [CLONE_MENU] },
  control_delete_clones_of: { shape: 'stack', name: 'delete_clones_of', params: [CLONE_MENU] },
  control_delete_this_clone: { shape: 'stack', name: 'delete_this_clone', params: [] },
  control_start_as_clone: { shape: 'hat', name: 'started_as_clone', params: [] },

  control_forever: { shape: 'c', name: 'forever', params: [], substacks: ['SUBSTACK'] },
  control_repeat: { shape: 'c', name: 'repeat', params: [input('TIMES', 'whole')], substacks: ['SUBSTACK'] },
  control_repeat_until: {
    shape: 'c',
    name: 'repeat_until',
    params: [input('CONDITION', 'boolean')],
    substacks: ['SUBSTACK'],
  },
  control_if: { shape: 'if', params: [input('CONDITION', 'boolean')], substacks: ['SUBSTACK'] },
  control_if_else: { shape: 'if', params: [input('CONDITION', 'boolean')], substacks: ['SUBSTACK', 'SUBSTACK2'] },
  control_expandableIf: { shape: 'expandable_if', params: [] },

  motion_xposition: { shape: 'reporter', name: 'x_position', params: [] },
  motion_yposition: { shape: 'reporter', name: 'y_position', params: [] },
  motion_direction: { shape: 'reporter', name: 'direction', params: [] },
  sensing_timer: { shape: 'reporter', name: 'timer', params: [] },
  operator_join: { shape: 'reporter', name: 'join', params: [input('STRING1', 'text'), input('STRING2', 'text')] },
  operator_length: { shape: 'reporter', name: 'length', params: [input('STRING', 'text')] },
  operator_random: { shape: 'reporter', name: 'random', params: [input('FROM', 'number'), input('TO', 'number')] },
  operator_round: { shape: 'reporter', name: 'round', params: [input('NUM', 'number')] },
  operator_mathop: {
    shape: 'reporter',
    params: [field('OPERATOR'), input('NUM', 'number')],
    variants: { param: 'OPERATOR', names: MATH_FUNCTIONS },
  },
  operator_letter_of: { shape: 'reporter', name: 'letter_of', params: [input('LETTER', 'whole'), input('STRING', 'text')] },
  operator_contains: { shape: 'reporter', name: 'contains', params: [input('STRING1', 'text'), input('STRING2', 'text')] },
  sensing_keypressed: {
    shape: 'reporter',
    name: 'is_key_pressed',
    params: [menu('KEY_OPTION', 'sensing_keyoptions', 'KEY_OPTION', 'space')],
  },
  looks_size: { shape: 'reporter', name: 'size', params: [] },
  looks_costumenumbername: {
    shape: 'reporter',
    params: [field('NUMBER_NAME')],
    variants: { param: 'NUMBER_NAME', names: { number: 'costume_number', name: 'costume_name' } },
  },

  data_itemoflist: { shape: 'reporter', name: 'item_of_list', params: [input('INDEX', 'integer'), LIST] },
  data_itemnumoflist: { shape: 'reporter', name: 'item_number_of_list', params: [input('ITEM', 'text'), LIST] },
  data_lengthoflist: { shape: 'reporter', name: 'length_of_list', params: [LIST] },
  data_listcontainsitem: { shape: 'reporter', name: 'list_contains', params: [LIST, input('ITEM', 'text')] },

  operator_or: { shape: 'infix', symbol: 'or', precedence: 1, operand: 'boolean', result: 'boolean' },
  operator_and: { shape: 'infix', symbol: 'and', precedence: 2, operand: 'boolean', result: 'boolean' },
  operator_not: { shape: 'prefix', symbol: 'not', precedence: 3, params: [input('OPERAND', 'boolean')] },
  operator_lt: { shape: 'infix', symbol: '<', precedence: 4, operand: 'text', result: 'boolean' },
  operator_gt: { shape: 'infix', symbol: '>', precedence: 4, operand: 'text', result: 'boolean' },
  operator_equals: { shape: 'infix', symbol: '==', precedence: 4, operand: 'text', result: 'boolean' },
  operator_add: { shape: 'infix', symbol: '+', precedence: 5, operand: 'number', result: 'reporter' },
  operator_subtract: { shape: 'infix', symbol: '-', precedence: 5, operand: 'number', result: 'reporter' },
  operator_multiply: { shape: 'infix', symbol: '*', precedence: 6, operand: 'number', result: 'reporter' },
  operator_divide: { shape: 'infix', symbol: '/', precedence: 6, operand: 'number', result: 'reporter' },
  operator_mod: { shape: 'infix', symbol: '%', precedence: 6, operand: 'number', result: 'reporter' },

  procedures_definition: { shape: 'define', params: [] },
  procedures_definition_return: { shape: 'define', params: [] },
  procedures_call: { shape: 'call', params: [] },
  procedures_return: { shape: 'return', params: [input('return', 'text')] },
  procedures_set: { shape: 'set_argument', params: [input('PARAM', 'argument'), input('VALUE', 'text')] },
  argument_reporter_string_number: { shape: 'argument', params: [] },
  argument_reporter_boolean: { shape: 'argument', params: [] },
};

const NON_ASSOCIATIVE_PRECEDENCE = 4;
export const isNonAssociative = (spec) => spec.precedence === NON_ASSOCIATIVE_PRECEDENCE;

const OPERAND_INPUTS = {
  number: ['NUM1', 'NUM2'],
  text: ['OPERAND1', 'OPERAND2'],
  boolean: ['OPERAND1', 'OPERAND2'],
};
for (const spec of Object.values(BLOCKS)) {
  if (spec.shape === 'infix') spec.params = OPERAND_INPUTS[spec.operand].map((name) => input(name, spec.operand));
  spec.substacks ??= [];
}

const textNames = (spec) => (spec.variants ? Object.values(spec.variants.names) : [spec.name]);

export const textName = (spec, args) => (spec.variants ? spec.variants.names[args[spec.variants.param]] : spec.name);

export const variantValue = (spec, name) =>
  spec.variants && Object.keys(spec.variants.names).find((value) => spec.variants.names[value] === name);

const indexByName = (shapes) =>
  Object.fromEntries(
    Object.entries(BLOCKS)
      .filter(([, spec]) => shapes.includes(spec.shape))
      .flatMap(([opcode, spec]) => textNames(spec).map((name) => [name, opcode])),
  );

const indexBySymbol = (shape) =>
  Object.fromEntries(
    Object.entries(BLOCKS)
      .filter(([, spec]) => spec.shape === shape)
      .map(([opcode, spec]) => [spec.symbol, opcode]),
  );

export const HAT_BY_NAME = indexByName(['hat']);
export const STATEMENT_BY_NAME = indexByName(['stack']);
export const C_BLOCK_BY_NAME = indexByName(['c']);
export const REPORTER_BY_NAME = indexByName(['reporter']);
export const ASSIGN_BY_SYMBOL = indexBySymbol('assign');
export const INFIX_BY_SYMBOL = indexBySymbol('infix');

export const LIST_REPORTER_NAME = 'list';
export const KEYWORDS = new Set([
  'when', 'stack', 'define', 'return', 'if', 'elif', 'else', 'pass', 'and', 'or', 'not', 'true', 'false', '_',
]);
export const BUILTIN_NAMES = new Set([LIST_REPORTER_NAME, ...Object.values(BLOCKS).flatMap(textNames).filter(Boolean)]);

export const STATEMENT_SHAPES = new Set(['stack', 'c', 'if', 'expandable_if', 'assign', 'call', 'return', 'set_argument']);

export const DEFAULT_PROCEDURE_COLOR = ['#FF6680', '#FF4D6A', '#FF3355'];
export const ARGUMENT_OPCODES = { text: 'argument_reporter_string_number', number: 'argument_reporter_string_number', boolean: 'argument_reporter_boolean' };
const PROCEDURE_SLOT_TYPES = { '%s': 'text', '%n': 'number', '%b': 'boolean' };
export const procedureSlots = (proccode) => (proccode.match(/%[snb]/g) ?? []).map((token) => PROCEDURE_SLOT_TYPES[token]);
const STANDARD_DEFAULTS = { text: '', number: '1', boolean: 'false' };
export const defaultArgument = (slot) => STANDARD_DEFAULTS[slot];
