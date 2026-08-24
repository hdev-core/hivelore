'use client';

import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { cn } from '@/lib/styles';

export type StructuredEditorContent = Record<string, unknown>;

export type RichTextEditorProps = {
  className?: string;
  disabled?: boolean;
  initialContent?: StructuredEditorContent | string;
  label?: string;
  onChange?: (html: string) => void;
  onJsonChange?: (content: StructuredEditorContent) => void;
  placeholder?: string;
  readOnly?: boolean;
};

export function RichTextEditor({
  className,
  disabled = false,
  initialContent = '',
  label = 'Contribution editor',
  onChange,
  onJsonChange,
  placeholder = 'Draft lore contribution notes...',
  readOnly = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    content: initialContent,
    editable: !disabled && !readOnly,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    onUpdate: ({ editor: updatedEditor }) => {
      onChange?.(updatedEditor.getHTML());
      onJsonChange?.(updatedEditor.getJSON() as StructuredEditorContent);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled && !readOnly);
  }, [disabled, editor, readOnly]);

  return (
    <div className={cn('rich-text-editor', className)}>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        className="rich-text-editor__surface"
      >
        <EditorToolbar disabled={disabled || readOnly} editor={editor} />
        <EditorContent
          aria-label={label}
          className="rich-text-editor__content"
          editor={editor}
          role="textbox"
        />
      </div>
    </div>
  );
}
