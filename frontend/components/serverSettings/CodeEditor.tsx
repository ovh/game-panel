import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import ReactCodeMirror from '@uiw/react-codemirror';

function detectLanguage(filename: string): Extension | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'json':               return json();
    case 'yaml': case 'yml':   return yaml();
    case 'xml':  case 'config':return xml();
    case 'js':   case 'mjs':   return javascript();
    case 'ts':                 return javascript({ typescript: true });
    case 'css':                return css();
    case 'html': case 'htm':   return html();
    case 'md':   case 'markdown': return markdown();
    // .toml / .ini / .cfg / .conf / .properties → plain text (no package)
    default:                   return null;
  }
}

const baseTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': {
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
    fontSize: '13px',
    overflow: 'auto',
  },
  '&.cm-focused': { outline: 'none' },
});

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  filename: string;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, filename, readOnly = false }: CodeEditorProps) {
  const langExt = detectLanguage(filename);

  const extensions: Extension[] = [
    baseTheme,
    EditorView.lineWrapping,
    ...(langExt ? [langExt] : []),
  ];

  return (
    <ReactCodeMirror
      value={value}
      onChange={onChange}
      theme={oneDark}
      extensions={extensions}
      height="100%"
      editable={!readOnly}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        bracketMatching: true,
        closeBrackets: !readOnly,
        autocompletion: false,
        indentOnInput: true,
      }}
      style={{ height: '100%' }}
    />
  );
}
