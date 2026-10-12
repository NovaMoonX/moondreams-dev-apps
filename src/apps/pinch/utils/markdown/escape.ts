/** Text a person typed, made safe to paste into a chat: one line, Markdown punctuation escaped so a title with `*`, `#` or `@` stays plain text. */
export const escapeMarkdown = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_{}[\]<>()#+!|~@])/g, '\\$1');
