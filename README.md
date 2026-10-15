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
- True/false slots accept any reporter or variable, as PenguinMod allows. PenguinMod's checkbox values are `true` and `false`.
- Lists are named with strings: `add_to_list(item, "enemies")`, `item_of_list(1, "enemies")`. `list("enemies")` reports the whole list.
- Menus take strings: `create_clone_of("_myself_")`, `switch_costume("idle")`, `is_key_pressed("space")`. A reporter can replace the string.
- Blocks with a dropdown that changes what they do get one name per option: `abs(x)`, `floor(x)`, `e_pow(x)`, `go_to_front()`, `costume_name()`.
- PenguinMod's expandable if starts with `if+`, then any number of `elif` and an optional `else`. A plain `if` / `else` is Scratch's if block.

## Custom blocks

```
@color("#4C97FF", "#4488e6", "#3d79cc")
define warp `distance to %n %n`(x, y) -> string:
    return x * x + y * y

define reset():
    x = 0

when flag_clicked:
    reset()
    say(`distance to %n %n`(3, 4))
```

- The name is the exact block label, with `%s` (text), `%n` (number) and `%b` (true/false) where inputs go. It goes in backticks unless it's a plain identifier that isn't a built-in block name.
- The names in parentheses name the inputs in order. Inside the define, they read the input, and `name = v` sets it (PenguinMod).
- `warp` means run without screen refresh. `-> string` or `-> boolean` makes it a reporter (PenguinMod), which uses `return v`.
- `@color(...)` and `@defaults(...)` lines appear only when the color or the input defaults differ from the standard ones (`""`, `1`, `false`).
- A call without backticks has to match a define in the same sprite. With backticks, it can call a block whose define is missing.

## Web page

`index.html` is a converter page with no build step: open an `.sb3`, `.pmp` or `project.json`, edit each sprite as text, and save a new copy. Scripts it can't show as text yet stay as they are. Comments attached to converted scripts become loose workspace comments. Everything runs in the browser.

Deploy the repo root as a static site (no build step, no settings). All paths are relative, so it also works when proxied under a subpath such as `kmann.dev/apps/blocktext/`.

## API

```js
import { blocksToText, textToBlocks } from './src/index.js';

const text = blocksToText(target.blocks);
const { blocks, variables, broadcasts } = textToBlocks(text, { variables: target.variables, stageVariables, broadcasts });
```

To edit a sprite while keeping the scripts that can't be converted yet:

```js
import { applyText, openProjectFile, saveProjectFile, targetToText } from './src/index.js';

const { project, entries } = await openProjectFile(bytes);
const split = targetToText(target);
const { blocks, variables, broadcasts, comments } = applyText(target, editedText, { convertedIds: split.convertedIds, stage });
const file = await saveProjectFile(project, entries);
```

## Status

About 80 blocks: events, motion, say/think, hide/show, size, costumes, layers, control (including stop, clones and PenguinMod's expandable if), operators and math functions, variables, lists and custom blocks. Blocks it doesn't support throw `UnsupportedBlockError`.

Not yet supported: graphic effects, sound, pen, sensing beyond keys and timer, extensions, comments, script positions (scripts are re-stacked in a column), input reporters dragged outside their define, and variables with the same name as an input of the custom block using them.

Normalized on the way through (no effect on how a project runs): `"true"` vs `true` flags, numbers stored as JSON numbers, which shadow type a `%s` input uses, and malformed default lists.

`node scripts/coverage.js <files.sb3|.pmp...>` reports how many scripts in real projects convert and round-trip cleanly, and which blocks are missing.

## Develop

```
npm test
```
