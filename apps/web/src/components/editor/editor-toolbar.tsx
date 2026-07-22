'use client';

import type { Editor } from '@tiptap/react';

type EditorToolbarProps = {
  disabled?: boolean;
  editor: Editor | null;
};

type ToolbarButton = {
  isActive?: (editor: Editor) => boolean;
  isDisabled?: (editor: Editor) => boolean;
  label: string;
  onClick: (editor: Editor) => void;
  pressed?: boolean;
  text: string;
};

const toolbarButtons: ToolbarButton[] = [
  {
    label: 'Set paragraph',
    onClick: (editor) => editor.chain().focus().setParagraph().run(),
    isActive: (editor) => editor.isActive('paragraph'),
    text: 'P',
  },
  {
    label: 'Set heading level 2',
    onClick: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    text: 'H2',
  },
  {
    label: 'Set heading level 3',
    onClick: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    text: 'H3',
  },
  {
    label: 'Toggle bold',
    onClick: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive('bold'),
    text: 'B',
  },
  {
    label: 'Toggle italic',
    onClick: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive('italic'),
    text: 'I',
  },
  {
    label: 'Toggle bulleted list',
    onClick: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
    text: 'List',
  },
  {
    label: 'Toggle numbered list',
    onClick: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
    text: '1.',
  },
  {
    label: 'Toggle blockquote',
    onClick: (editor) => editor.chain().focus().toggleBlockquote().run(),
    isActive: (editor) => editor.isActive('blockquote'),
    text: 'Quote',
  },
  {
    label: 'Undo',
    onClick: (editor) => editor.chain().focus().undo().run(),
    isDisabled: (editor) => !editor.can().undo(),
    text: 'Undo',
  },
  {
    label: 'Redo',
    onClick: (editor) => editor.chain().focus().redo().run(),
    isDisabled: (editor) => !editor.can().redo(),
    text: 'Redo',
  },
];

export function EditorToolbar({ disabled = false, editor }: EditorToolbarProps) {
  return (
    <div
      aria-label="Rich text formatting controls"
      className="rich-text-editor__toolbar"
      role="toolbar"
    >
      {toolbarButtons.map((button) => {
        const isPressed = editor ? (button.isActive?.(editor) ?? false) : false;
        const isDisabled =
          disabled || !editor || (editor ? (button.isDisabled?.(editor) ?? false) : true);

        return (
          <button
            key={button.label}
            aria-label={button.label}
            aria-pressed={button.isActive ? isPressed : undefined}
            className="rich-text-editor__toolbar-button"
            disabled={isDisabled}
            onClick={() => {
              if (editor) {
                button.onClick(editor);
              }
            }}
            type="button"
          >
            {button.text}
          </button>
        );
      })}
    </div>
  );
}
