const INDENT = '    ';

export function enableCodeKeys(textarea) {
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) dedentLines(textarea);
      else if (textarea.selectionStart === textarea.selectionEnd) insert(textarea, INDENT);
      else indentLines(textarea);
    } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const line = currentLine(textarea);
      const indent = line.match(/^ */)[0];
      insert(textarea, '\n' + indent + (line.trimEnd().endsWith(':') ? INDENT : ''));
    }
  });
}

export function goToLine(textarea, lineNumber) {
  const lines = textarea.value.split('\n');
  const start = lines.slice(0, lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0);
  textarea.focus();
  textarea.setSelectionRange(start, start + (lines[lineNumber - 1]?.length ?? 0));
}

function currentLine(textarea) {
  const before = textarea.value.slice(0, textarea.selectionStart);
  return before.slice(before.lastIndexOf('\n') + 1);
}

function insert(textarea, text) {
  if (!document.execCommand('insertText', false, text)) {
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input'));
  }
}

function selectWholeLines(textarea) {
  const { value, selectionStart, selectionEnd } = textarea;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const endBreak = value.indexOf('\n', selectionEnd - (selectionEnd > selectionStart ? 1 : 0));
  const end = endBreak === -1 ? value.length : endBreak;
  textarea.setSelectionRange(start, end);
  return value.slice(start, end).split('\n');
}

function replaceSelectedLines(textarea, lines) {
  const start = textarea.selectionStart;
  const text = lines.join('\n');
  insert(textarea, text);
  textarea.setSelectionRange(start, start + text.length);
}

function indentLines(textarea) {
  replaceSelectedLines(textarea, selectWholeLines(textarea).map((line) => INDENT + line));
}

function dedentLines(textarea) {
  replaceSelectedLines(textarea, selectWholeLines(textarea).map((line) => line.replace(/^ {1,4}/, '')));
}
