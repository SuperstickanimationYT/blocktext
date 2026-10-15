import { TextSyntaxError, applyText, openProjectFile, parse, saveProjectFile, targetToText } from '../src/index.js';
import { enableCodeKeys, goToLine } from './editor.js';

const $ = (selector) => document.querySelector(selector);
const ui = {
  open: $('[data-open]'),
  save: $('[data-save]'),
  empty: $('[data-empty]'),
  workspace: $('[data-workspace]'),
  fileName: $('[data-file-name]'),
  targets: $('[data-targets]'),
  text: $('[data-text]'),
  status: $('[data-status]'),
  keptPanel: $('[data-kept-panel]'),
  keptSummary: $('[data-kept-summary]'),
  kept: $('[data-kept]'),
};

const CHECK_DELAY_MS = 250;

let session = null;

enableCodeKeys(ui.text);

ui.open.addEventListener('change', () => {
  if (ui.open.files[0]) openFile(ui.open.files[0]);
  ui.open.value = '';
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  const file = event.dataTransfer.files[0];
  if (file) openFile(file);
});

window.addEventListener('beforeunload', (event) => {
  if (session?.items.some(isEdited)) event.preventDefault();
});

async function openFile(file) {
  if (session?.items.some(isEdited) && !confirm('Discard your unsaved text edits?')) return;
  try {
    const { project, entries } = await openProjectFile(new Uint8Array(await file.arrayBuffer()));
    const stage = project.targets.find((target) => target.isStage);
    const items = project.targets.map((target) => {
      const split = targetToText(target);
      return { target, split, text: split.text, savedText: split.text, error: null };
    });
    session = { fileName: file.name, project, entries, stage, items, current: 0 };
  } catch (error) {
    alert(`Could not open ${file.name}: ${error.message}`);
    return;
  }
  ui.empty.hidden = true;
  ui.workspace.hidden = false;
  ui.fileName.textContent = session.fileName;
  const firstSprite = session.items.findIndex((item) => !item.target.isStage);
  select(firstSprite === -1 ? 0 : firstSprite);
}

const isEdited = (item) => item.text !== item.savedText;

function select(index) {
  session.current = index;
  const item = session.items[index];
  ui.text.value = item.text;
  ui.text.scrollTop = 0;
  renderTargets();
  renderStatus();
  renderKept();
}

function renderTargets() {
  ui.targets.replaceChildren(
    ...session.items.map((item, index) => {
      const li = document.createElement('li');
      li.classList.toggle('has-error', Boolean(item.error));
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-current', String(index === session.current));
      const total = item.split.convertedIds.size + item.split.kept.length;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = item.error ? 'has an error' : `${item.split.convertedIds.size} of ${total} scripts as text${isEdited(item) ? ', edited' : ''}`;
      button.append(item.target.name, count);
      button.addEventListener('click', () => select(index));
      li.append(button);
      return li;
    }),
  );
  ui.save.disabled = session.items.some((item) => item.error) || !session.items.some(isEdited);
}

function renderStatus() {
  const { error, split } = session.items[session.current];
  ui.status.classList.toggle('error', Boolean(error));
  if (error) {
    ui.status.textContent = error.line ? `${error.message} (click to jump there)` : error.message;
  } else if (split.convertedIds.size === 0 && split.kept.length === 0) {
    ui.status.textContent = 'No scripts yet. Type some, starting with "when flag_clicked:".';
  } else {
    ui.status.textContent = 'Text is valid.';
  }
}

function renderKept() {
  const { kept } = session.items[session.current].split;
  ui.keptPanel.hidden = kept.length === 0;
  ui.keptSummary.textContent = `${kept.length} script${kept.length === 1 ? '' : 's'} kept as blocks (not editable as text yet)`;
  const reasons = new Map();
  for (const { reason } of kept) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  ui.kept.replaceChildren(
    ...[...reasons].sort((a, b) => b[1] - a[1]).map(([reason, count]) => {
      const li = document.createElement('li');
      li.textContent = `${count} × uses ${reason}`;
      return li;
    }),
  );
}

ui.status.addEventListener('click', () => {
  const { error } = session.items[session.current];
  if (error?.line) goToLine(ui.text, error.line);
});

let checkTimer;
ui.text.addEventListener('input', () => {
  const item = session.items[session.current];
  item.text = ui.text.value;
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    item.error = checkText(item.text);
    renderTargets();
    renderStatus();
  }, CHECK_DELAY_MS);
});

function checkText(text) {
  try {
    parse(text);
    return null;
  } catch (error) {
    if (error instanceof TextSyntaxError) return { message: error.message, line: error.line };
    return { message: error.message, line: null };
  }
}

ui.save.addEventListener('click', async () => {
  const { project, entries, stage, items } = session;
  try {
    for (const item of items.filter(isEdited)) {
      const result = applyText(item.target, item.text, { convertedIds: item.split.convertedIds, stage });
      Object.assign(item.target, { blocks: result.blocks, variables: result.variables, comments: result.comments });
      stage.broadcasts = result.broadcasts;
      item.split = targetToText(item.target);
      item.savedText = item.text;
    }
    download(await saveProjectFile(project, entries), savedName(session.fileName));
  } catch (error) {
    alert(`Could not save: ${error.message}`);
  }
  renderTargets();
  renderKept();
});

function savedName(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? `${name} (text edit)` : `${name.slice(0, dot)} (text edit)${name.slice(dot)}`;
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
