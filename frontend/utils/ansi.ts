import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({
  fg: '#d1d5db',
  bg: '#000000',
  newline: true,
  escapeXML: true,
  stream: false,
  colors: {
    0: '#000',
    1: '#A00',
    2: '#0A0',
    3: '#A50',
    4: '#00A',
    5: '#A0A',
    6: '#0AA',
    7: '#AAA',
    8: '#555',
    9: '#F55',
    10: '#5F5',
    11: '#FF5',
    12: '#55F',
    13: '#F5F',
    14: '#5FF',
    15: '#FFF',
  },
});

export const ansiToHtml = (text: string): string => {
  if (!text) return '';
  // Preserve exact spacing via pre/pre-wrap styles at render sites.
  return converter.toHtml(text);
};

export const stripAnsi = (text: string): string =>
  (text ?? '').replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  );
