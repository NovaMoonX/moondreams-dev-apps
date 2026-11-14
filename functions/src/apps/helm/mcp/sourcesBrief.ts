export interface ConnectedSource {
  name: string;
  about: string;
  categories: { label: string; meaning: string }[];
}

/** What the person's connected sources are, so their words make sense, and where to send a question this connection can't read. */
export const sourcesBriefFor = (name: string, sources: ConnectedSource[]) =>
  sources.length === 0
    ? ''
    : [
        `What the person has connected to Helm, so their words make sense: ${sources
          .map(
            (source) =>
              `${source.name}: ${source.about}${
                source.categories.length > 0
                  ? ` It shares ${source.categories.map((category) => `${category.label} (${category.meaning.replace(/\.$/, '')})`).join('; ')}.`
                  : ''
              }`,
          )
          .join(' ')}`,
        `From these, this connection reads only the events on their calendar (get_calendar) and which ones are connected (list_connections). It can't read anything else these hold. When they ask about one, say what it is, that it can't be read here, and that they can ask ${name} in Helm.`,
      ].join(' ');
