import React from 'react';
import {
  $getSelection,
  $isRangeSelection,
  $createTextNode,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

function applyStyle(editor, styleName, value) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.formatText(styleName, value);
    }
  });
}

export function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();

  return (
    <div className="editor-toolbar">
      <button type="button" onClick={() => editor.dispatchCommand('bold', undefined)}><b>B</b></button>
      <button type="button" onClick={() => editor.dispatchCommand('italic', undefined)}><i>I</i></button>
      <button type="button" onClick={() => editor.dispatchCommand('underline', undefined)}><u>U</u></button>
      <button type="button" onClick={() => editor.dispatchCommand('strikethrough', undefined)}><s>S</s></button>
      <input
        type="color"
        title="Цвет текста"
        onChange={e => applyStyle(editor, 'color', e.target.value)}
        style={{ marginLeft: 8, marginRight: 2 }}
      />
      <input
        type="color"
        title="Цвет фона"
        onChange={e => applyStyle(editor, 'backgroundColor', e.target.value)}
        style={{ marginLeft: 2 }}
      />
    </div>
  );
}
