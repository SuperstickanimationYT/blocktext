import { decode } from './decode.js';
import { encode } from './encode.js';
import { parse } from './parse.js';
import { print } from './print.js';

export { decode, encode, parse, print };
export { UnsupportedBlockError } from './decode.js';
export { TextSyntaxError } from './parse.js';

export const blocksToText = (blocks) => print(decode(blocks));
export const textToBlocks = (text, names) => encode(parse(text), names);
