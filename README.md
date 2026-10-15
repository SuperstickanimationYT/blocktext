# blocktext

Two-way, 1:1 converter between Scratch/PenguinMod block data (`project.json` target `blocks`) and an indentation-based text language. Planned to power a text tab in a PenguinMod fork.

```
when flag_clicked:
    score = 0
    forever:
        if x_position() > 240 and not `dead?`:
            turn_right(15)
            score += 1
        else:
            move(10)

when received("game over"):
    say(join("score: ", score))
```

## Rules

- Each block maps to exactly one text form, and text maps back to the same blocks.
- Scripts start with `when <event>:`; scripts with no hat start with `stack:`.
- An empty C-block body is `pass`. An empty true/false slot is `_`.
- Variable names that aren't plain identifiers (or clash with keywords) go in backticks: `` `my speed` ``.
- Operators: `+ - * / %`, `< > ==`, `and or not`. Scratch nesting is kept with parentheses.
- `x = v` sets a variable and `x += v` changes it.
- True/false slots accept any reporter or variable, as PenguinMod allows.

## API

```js
import { blocksToText, textToBlocks } from './src/index.js';

const text = blocksToText(target.blocks);
const { blocks, variables, broadcasts } = textToBlocks(text, { variables: target.variables, stageVariables, broadcasts });
```

## Status

About 50 core blocks (events, motion, say/think, control, operators, variables). Blocks it doesn't support throw `UnsupportedBlockError`.

Not yet supported: custom blocks (`procedures_*`), lists, menus, clones, looks/sound/pen, extensions, comments, script positions (scripts are re-stacked in a column).

`node scripts/coverage.js <files.sb3|.pmp...>` reports how many scripts in real projects convert and round-trip cleanly, and which blocks are missing.

## Develop

```
npm test
```
