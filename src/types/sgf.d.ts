declare module '@sabaki/sgf' {
  export function stringify(
    nodes: unknown[],
    options?: { linebreak?: string; indent?: string },
  ): string

  export function parse(
    contents: string,
    options?: { getId?: () => string | number },
  ): unknown[]
}
