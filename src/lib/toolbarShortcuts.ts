/*
 * toolbarShortcuts — shared definition of the game and analysis keyboard
 * shortcuts. Analysis controls use Ctrl+1..Ctrl+5 in on-screen order;
 * game modes use Ctrl+[ and Ctrl+].
 *
 * Matching uses KeyboardEvent.code so shortcuts follow physical keys. The
 * displayed hints and title labels are generated from this list.
 */

export type ToolbarShortcutId =
  | 'selfplay'
  | 'ai'
  | 'winrate'
  | 'candidates'
  | 'policy'
  | 'ownership'
  | 'summary'

export interface ToolbarShortcut {
  /** Stable id matching the toolbar control it activates. */
  id: ToolbarShortcutId
  /** KeyboardEvent.code of the physical key. */
  code: string
  /** Full shortcut label used in accessible titles. */
  keyLabel: string
  /** Digit shown in the top-bar button hint `(n)`. */
  digit?: string
}

/** Analysis controls first in top-bar order, followed by game-mode controls. */
export const TOOLBAR_SHORTCUTS: readonly ToolbarShortcut[] = [
  { id: 'candidates', code: 'Digit1', keyLabel: 'Ctrl + 1', digit: '1' },
  { id: 'ownership', code: 'Digit2', keyLabel: 'Ctrl + 2', digit: '2' },
  { id: 'winrate', code: 'Digit3', keyLabel: 'Ctrl + 3', digit: '3' },
  { id: 'policy', code: 'Digit4', keyLabel: 'Ctrl + 4', digit: '4' },
  { id: 'summary', code: 'Digit5', keyLabel: 'Ctrl + 5', digit: '5' },
  { id: 'selfplay', code: 'BracketLeft', keyLabel: 'Ctrl + [' },
  { id: 'ai', code: 'BracketRight', keyLabel: 'Ctrl + ]' },
]

const BY_CODE = new Map(TOOLBAR_SHORTCUTS.map((s) => [s.code, s.id]))

/** KeyboardEvent.code → shortcut id, or undefined. */
export function toolbarShortcutIdForCode(code: string): ToolbarShortcutId | undefined {
  return BY_CODE.get(code)
}
