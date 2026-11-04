/*
 * useToolbarShortcuts — window-level toolbar shortcuts that mirror
 * the top-bar toolbar (see lib/toolbarShortcuts.ts for the mapping).
 *
 * Guard rules:
 *  - Requires Ctrl with no Shift/Alt/Meta. The combination is captured
 *    before page-level handlers such as Vimium.
 *  - Ignored while an input/textarea/select/contenteditable element has
 *    focus so form controls retain their native keyboard behavior.
 *  - Ignored while `blocked` is true — the caller passes a flag that is
 *    true whenever a modal dialog is open (or the toolbar is otherwise
 *    not visible, e.g. zen mode).
 *  - Contextual/disabled controls are honored by the caller: a shortcut
 *    whose button is hidden (후보수 in AI mode) or disabled (engine-off
 *    analysis toggles) maps to no action and therefore does nothing.
 */
import { useEffect, useRef } from 'react'
import { toolbarShortcutIdForCode } from '../lib/toolbarShortcuts.ts'
import type { ToolbarShortcutId } from '../lib/toolbarShortcuts.ts'

export type ToolbarShortcutActions = {
  [K in ToolbarShortcutId]?: (() => void) | undefined
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el === null || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

/**
 * Attach the toolbar shortcuts. `actions` maps shortcut ids to
 * callbacks; omit an id (or map it to undefined) when its toolbar control
 * is not currently actionable. `blocked` suspends all shortcuts — true
 * while a modal dialog is open.
 */
export function useToolbarShortcuts(
  actions: ToolbarShortcutActions,
  blocked: boolean,
): void {
  // Keep the latest actions in a ref so the window listener itself does
  // not have to re-register on every render.
  const actionsRef = useRef<ToolbarShortcutActions>(actions)
  useEffect(() => {
    actionsRef.current = actions
  })

  useEffect(() => {
    if (blocked) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (
        isEditableTarget(e.target) ||
        !e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.metaKey
      ) {
        return
      }
      const id = toolbarShortcutIdForCode(e.code)
      if (id === undefined) return
      e.preventDefault()
      e.stopImmediatePropagation()
      actionsRef.current[id]?.()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [blocked])
}
