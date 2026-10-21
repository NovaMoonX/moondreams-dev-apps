const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns the nodes with every key's leading `@` written as `_` (`@type` is `_type`): the client of a callable reads an `@type` key as its own type marker and refuses the whole response. */
export const toWireNodes = (nodes: Record<string, unknown>[]) =>
  JSON.parse(JSON.stringify(nodes), (_key, value: unknown) =>
    isObject(value)
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key.startsWith('@') ? `_${key.slice(1)}` : key,
            entry,
          ]),
        )
      : value,
  ) as Record<string, unknown>[];
