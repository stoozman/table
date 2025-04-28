import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  LexicalComposer,
} from '@lexical/react/LexicalComposer';
import {
  useLexicalComposerContext,
} from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { $getRoot } from 'lexical';
import { ToolbarPlugin } from './LexicalToolbarPlugin';
import './LexicalCommentEditor.css';

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  paragraph: 'editor-paragraph',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    underlineStrikethrough: 'editor-text-underlineStrikethrough',
    code: 'editor-text-code',
  },
};

function Placeholder() {
  return <div className="editor-placeholder">Введите комментарий...</div>;
}

// Плагин для импорта HTML в редактор при изменении value
function ImportHtmlPlugin({ value }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor || !value) return;
    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(value, 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom.body);
      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    });
  }, [editor, value]);
  return null;
}

export default function LexicalCommentEditor({ value, onChange }) {
  const initialConfig = {
    namespace: 'CommentEditor',
    theme,
    onError(error) {
      throw error;
    },
  };

  const handleChange = useCallback((editorState, editor) => {
    editorState.read(() => {
      const html = $generateHtmlFromNodes(editor, null);
      onChange(html);
    });
  }, [onChange]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ImportHtmlPlugin value={value} />
      <div className="editor-container">
        <ToolbarPlugin />
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          placeholder={<Placeholder />}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
      </div>
    </LexicalComposer>
  );
}
