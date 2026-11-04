/* Top-bar shortcut hints follow the analysis controls' visual and key order. */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar.tsx'
import { TOOLBAR_SHORTCUTS } from '../lib/toolbarShortcuts.ts'
import type { TopBarProps } from './TopBar.tsx'

const baseProps: TopBarProps = {
  gameMode: 'selfplay',
  engineEnabled: true,
  showWinrate: false,
  onToggleWinrate: () => {},
  showCandidates: false,
  onToggleCandidates: () => {},
  showPolicy: false,
  onTogglePolicy: () => {},
  showOwnership: false,
  onToggleOwnership: () => {},
  showSummary: false,
  onToggleSummary: () => {},
  soundEnabled: false,
  onToggleSound: () => {},
  onToggleZen: () => {},
  onOpenSettings: () => {},
}

describe('TopBar — analysis shortcut hints', () => {
  afterEach(cleanup)

  test('analysis buttons are ordered by shortcut priority', () => {
    render(<TopBar {...baseProps} />)

    const ids = [
      'candidates-toggle',
      'ownership-toggle',
      'winrate-toggle',
      'policy-toggle',
      'analysis-summary-toggle',
    ]
    const buttons = Array.from(
      document.querySelectorAll('.top-bar-analysis button'),
    ).map((button) => button.id)
    expect(buttons).toEqual(ids)
    ids.forEach((id, index) => {
      expect(
        document.getElementById(id)?.querySelector('.top-bar-shortcut-hint')?.textContent,
      ).toBe(`(${index + 1})`)
    })
  })

  test('digit hints and titles match the shared shortcut definition', () => {
    render(<TopBar {...baseProps} />)

    const analysisShortcuts = TOOLBAR_SHORTCUTS.filter((shortcut) => shortcut.digit)
    expect(analysisShortcuts.map((shortcut) => shortcut.id)).toEqual([
      'candidates',
      'ownership',
      'winrate',
      'policy',
      'summary',
    ])
    analysisShortcuts.forEach((shortcut) => {
      const id = {
        candidates: 'candidates-toggle',
        ownership: 'ownership-toggle',
        winrate: 'winrate-toggle',
        policy: 'policy-toggle',
        summary: 'analysis-summary-toggle',
        selfplay: '',
        ai: '',
      }[shortcut.id]
      const button = document.getElementById(id)!
      expect(button.title).toContain(shortcut.keyLabel)
      expect(button.querySelector('.top-bar-shortcut-hint')?.textContent).toBe(
        `(${shortcut.digit})`,
      )
    })
  })

  test('game mode controls are not part of the analysis toolbar', () => {
    render(<TopBar {...baseProps} />)

    expect(document.querySelector('.top-bar-analysis #mode-selfplay')).toBeNull()
    expect(document.querySelector('.top-bar-analysis #mode-ai')).toBeNull()
    for (const label of ['후보수', '형세', '승률', '정책망', '분석 요약']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  test('hints are hidden from assistive technology and do not alter labels', () => {
    render(<TopBar {...baseProps} />)

    expect(document.getElementById('candidates-toggle')?.textContent).toBe('후보수(1)')
    document.querySelectorAll('.top-bar-shortcut-hint').forEach((hint) => {
      expect(hint.getAttribute('aria-hidden')).toBe('true')
    })
  })

  test('candidate button is omitted in AI mode', () => {
    render(<TopBar {...baseProps} gameMode="ai" />)

    expect(document.getElementById('candidates-toggle')).toBeNull()
    const hintDigits = Array.from(
      document.querySelectorAll('.top-bar-shortcut-hint'),
    ).map((hint) => hint.textContent)
    expect(hintDigits).not.toContain('(1)')
  })
})
