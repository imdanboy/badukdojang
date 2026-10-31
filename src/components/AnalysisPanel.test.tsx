/*
 * AnalysisPanel unit tests.
 * Covers: winrate formatting, scoreLead formatting, bar rendering,
 * disabled/idle/error/loading states.
 */
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  AnalysisPanel,
  getBlackWinrate,
  formatWinratePct,
  getScoreLead,
  formatScoreLead,
} from './AnalysisPanel.tsx'
import type { AnalyzeResponse } from '../lib/engine/types.ts'

function makeAnalysis(overrides: Partial<AnalyzeResponse> = {}): AnalyzeResponse {
  return {
    id: 'analyze',
    winrate: 0.5,
    scoreLead: 0,
    bestMoves: [],
    completed: true,
    ...overrides,
  }
}

describe('getBlackWinrate', () => {
  test('returns null for null analysis', () => {
    expect(getBlackWinrate(null)).toBeNull()
  })

  test('returns null when winrate is missing', () => {
    expect(getBlackWinrate({ id: 'x' } as AnalyzeResponse)).toBeNull()
  })

  test('returns null when winrate is NaN', () => {
    expect(getBlackWinrate(makeAnalysis({ winrate: Number.NaN }))).toBeNull()
  })

  test('returns the winrate value when present', () => {
    expect(getBlackWinrate(makeAnalysis({ winrate: 0.532 }))).toBe(0.532)
  })
})

describe('formatWinratePct', () => {
  test('0.532 → "53.2"', () => {
    expect(formatWinratePct(0.532)).toBe('53.2')
  })

  test('0.5 → "50.0"', () => {
    expect(formatWinratePct(0.5)).toBe('50.0')
  })

  test('1 → "100.0"', () => {
    expect(formatWinratePct(1)).toBe('100.0')
  })

  test('0 → "0.0"', () => {
    expect(formatWinratePct(0)).toBe('0.0')
  })
})

describe('getScoreLead', () => {
  test('returns null for null analysis', () => {
    expect(getScoreLead(null)).toBeNull()
  })

  test('returns null when scoreLead is missing', () => {
    expect(getScoreLead({ id: 'x' } as AnalyzeResponse)).toBeNull()
  })

  test('returns null when scoreLead is NaN', () => {
    expect(getScoreLead(makeAnalysis({ scoreLead: Number.NaN }))).toBeNull()
  })

  test('returns null when scoreLead is Infinity', () => {
    expect(getScoreLead(makeAnalysis({ scoreLead: Number.POSITIVE_INFINITY }))).toBeNull()
  })

  test('returns the scoreLead value when present', () => {
    expect(getScoreLead(makeAnalysis({ scoreLead: 5.3 }))).toBe(5.3)
  })
})

describe('formatScoreLead', () => {
  test('5.3 → "흑 +5.3"', () => {
    expect(formatScoreLead(5.3)).toBe('흑 +5.3')
  })

  test('-2.1 → "백 +2.1"', () => {
    expect(formatScoreLead(-2.1)).toBe('백 +2.1')
  })

  test('0 → "0.0"', () => {
    expect(formatScoreLead(0)).toBe('0.0')
  })

  test('NaN → "—"', () => {
    expect(formatScoreLead(Number.NaN)).toBe('—')
  })

  test('Infinity → "—"', () => {
    expect(formatScoreLead(Number.POSITIVE_INFINITY)).toBe('—')
  })

  test('large positive rounds to one decimal', () => {
    expect(formatScoreLead(99.99)).toBe('흑 +100.0')
  })

  test('large negative rounds to one decimal', () => {
    expect(formatScoreLead(-42.456)).toBe('백 +42.5')
  })
})

describe('AnalysisPanel component', () => {
  test('renders a percentage-free label for winrate 0.532', () => {
    const analysis = makeAnalysis({ winrate: 0.532 })
    render(<AnalysisPanel analysis={analysis} loading={false} error={null} engineEnabled={true} />)
    expect(screen.getByText('승률')).toBeTruthy()
    expect(screen.queryByText('53.2%')).toBeNull()
  })

  test('renders bar with black fill width matching winrate', () => {
    const analysis = makeAnalysis({ winrate: 0.6 })
    render(<AnalysisPanel analysis={analysis} loading={false} error={null} engineEnabled={true} />)
    const blackBar = document.getElementById('winrate-bar-black') as HTMLElement
    expect(blackBar).not.toBeNull()
    expect(blackBar.style.width).toBe('60%')
    const whiteBar = document.getElementById('winrate-bar-white') as HTMLElement
    expect(whiteBar.style.width).toBe('40%')
  })

  test('shows color labels without numeric percentages', () => {
    const analysis = makeAnalysis({ winrate: 0.7 })
    render(<AnalysisPanel analysis={analysis} loading={false} error={null} engineEnabled={true} />)
    expect(screen.getByText('흑')).toBeTruthy()
    expect(screen.getByText('백')).toBeTruthy()
    expect(screen.queryByText(/70\.0%|30\.0%/)).toBeNull()
  })

  test('disabled state when engine off', () => {
    render(<AnalysisPanel analysis={null} loading={false} error={null} engineEnabled={false} />)
    const panel = document.getElementById('analysis-panel')
    expect(panel?.getAttribute('data-state')).toBe('disabled')
    expect(screen.getByText(/승률 분석을 위해 엔진을 켜주세요/)).toBeTruthy()
  })

  test('idle state when no analysis and not loading', () => {
    render(<AnalysisPanel analysis={null} loading={false} error={null} engineEnabled={true} />)
    const panel = document.getElementById('analysis-panel')
    expect(panel?.getAttribute('data-state')).toBe('idle')
    expect(screen.getByText(/분석 대기 중/)).toBeTruthy()
  })

  test('loading indicator when loading is true', () => {
    render(<AnalysisPanel analysis={null} loading={true} error={null} engineEnabled={true} />)
    expect(screen.getByText(/분석 중/)).toBeTruthy()
  })

  test('error message rendered when error is set', () => {
    render(
      <AnalysisPanel
        analysis={null}
        loading={false}
        error="엔진 응답 없음"
        engineEnabled={true}
      />,
    )
    const errEl = screen.getByRole('alert')
    expect(errEl.textContent).toContain('엔진 응답 없음')
  })

  test('center marker is rendered at 50%', () => {
    const analysis = makeAnalysis({ winrate: 0.5 })
    render(<AnalysisPanel analysis={analysis} loading={false} error={null} engineEnabled={true} />)
    const bar = document.getElementById('winrate-bar')
    expect(bar).not.toBeNull()
    const marker = bar!.children[2] as HTMLElement
    expect(marker).not.toBeFalsy()
    expect(marker.style.left).toBe('50%')
  })

  test('vertical bar allocates black and white winrates top-to-bottom', () => {
    render(
      <AnalysisPanel
        analysis={makeAnalysis({ winrate: 0.68, scoreLead: 4.2 })}
        loading={false}
        error={null}
        engineEnabled={true}
        orientation="vertical"
      />,
    )

    const black = document.querySelector('.winrate-vertical-black') as HTMLElement
    const white = document.querySelector('.winrate-vertical-white') as HTMLElement
    expect(black.style.height).toBe('68%')
    expect(white.style.height).toBe('32%')
    expect(black.textContent).toBe('')
    expect(white.textContent).toBe('')
    expect(document.querySelector('.winrate-vertical-score-black')?.textContent).toBe('4.2')
    expect(document.querySelector('.winrate-vertical-score-white')).toBeNull()
  })

  test('shows a positive score margin in White section when White leads', () => {
    render(
      <AnalysisPanel
        analysis={makeAnalysis({ winrate: 0.37, scoreLead: -3.6 })}
        loading={false}
        error={null}
        engineEnabled={true}
        orientation="vertical"
      />,
    )

    const black = document.querySelector('.winrate-vertical-black') as HTMLElement
    const white = document.querySelector('.winrate-vertical-white') as HTMLElement
    expect(black.style.height).toBe('37%')
    expect(white.style.height).toBe('63%')
    expect(black.textContent).toBe('')
    expect(white.textContent).toBe('')
    expect(document.querySelector('.winrate-vertical-score-black')).toBeNull()
    expect(document.querySelector('.winrate-vertical-score-white')?.textContent).toBe('3.6')
  })
})
