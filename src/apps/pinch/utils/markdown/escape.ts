/** Text a person typed, made safe to paste into a chat: one line, Markdown punctuation escaped so a title with `*`, `#` or `@` stays plain text, and a line that starts with `-` or `1.` never becomes a list. */
export const escapeMarkdown = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_{}[\]<>()#+!|~@])/g, '\\$1')
    .replace(/^-/, '\\-')
    .replace(/^(\d+)([.)])/, '$1\\$2');
