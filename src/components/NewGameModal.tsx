/*
 * NewGameModal — per-game setup before starting: board size, mode,
 * and (for AI games) difficulty preset + play style.
 * Applies as a draft on confirm; cancel leaves everything untouched.
 */
import { useEffect, useState } from 'react'
import { Modal } from './Modal.tsx'
import {
  formatKyu,
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
} from '../lib/engineSettings.ts'
import type { PlayStyle } from '../lib/engineSettings.ts'
import type { BoardSize, GameMode } from '../lib/types.ts'

export interface NewGameConfig {
  size: BoardSize
  mode: GameMode
  difficulty: number
  playStyle: PlayStyle
}

export interface NewGameModalProps {
  open: boolean
  onClose: () => void
  boardSize: BoardSize
  gameMode: GameMode
  engineEnabled: boolean
  difficulty: number
  playStyle: PlayStyle
  onStart: (config: NewGameConfig) => void
}

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #3b3b5c',
  borderRadius: '4px',
  background: '#2a2a4e',
  color: '#e0e0e0',
  fontSize: '14px',
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  opacity: 0.7,
  minWidth: '80px',
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  background: active ? '#5a7fb5' : '#3b3b5c',
  color: '#e0e0e0',
})

const sliderStyle: React.CSSProperties = {
  cursor: 'pointer',
  accentColor: '#5a7fb5',
  flex: '1',
  minWidth: '120px',
}

export function NewGameModal({
  open,
  onClose,
  boardSize,
  gameMode,
  engineEnabled,
  difficulty,
  playStyle,
  onStart,
}: NewGameModalProps) {
  const [draftSize, setDraftSize] = useState<BoardSize>(boardSize)
  const [draftMode, setDraftMode] = useState<GameMode>(gameMode)
  const [draftDifficulty, setDraftDifficulty] = useState(difficulty)
  const [draftStyle, setDraftStyle] = useState<PlayStyle>(playStyle)

  // Re-sync the draft from current game values each time it opens.
  useEffect(() => {
    if (!open) return
    setDraftSize(boardSize)
    setDraftMode(gameMode)
    setDraftDifficulty(difficulty)
    setDraftStyle(playStyle)
  }, [open, boardSize, gameMode, difficulty, playStyle])

  if (!open) return null

  const handleStart = () => {
    onStart({
      size: draftSize,
      mode: draftMode,
      difficulty: draftDifficulty,
      playStyle: draftStyle,
    })
  }

  return (
    <Modal title="새 대국" onClose={onClose} closeButtonId="new-game-close">
      {/* Board size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="board-size-select" style={labelStyle}>
          바둑판 크기
        </label>
        <select
          id="board-size-select"
          value={String(draftSize)}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            const value = Number(e.currentTarget.value)
            setDraftSize(value as BoardSize)
          }}
          style={selectStyle}
        >
          <option value="9">9 x 9</option>
          <option value="13">13 x 13</option>
          <option value="19">19 x 19</option>
        </select>
      </div>

      {/* Mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={labelStyle}>모드</span>
        <button
          type="button"
          id="newgame-mode-selfplay"
          style={btnStyle(draftMode === 'selfplay')}
          onClick={() => setDraftMode('selfplay')}
        >
          혼자두기
        </button>
        <button
          type="button"
          id="newgame-mode-ai"
          style={btnStyle(draftMode === 'ai')}
          onClick={() => setDraftMode('ai')}
        >
          AI 대국
        </button>
      </div>

      {draftMode === 'ai' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px',
            background: '#16162a',
            borderRadius: '6px',
            border: '1px solid #2a2a4e',
          }}
        >
          {/* Difficulty preset */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="newgame-difficulty" style={labelStyle}>
              난이도
            </label>
            <input
              id="newgame-difficulty"
              type="range"
              min={MIN_DIFFICULTY}
              max={MAX_DIFFICULTY}
              value={draftDifficulty}
              onChange={(e) => setDraftDifficulty(Number(e.currentTarget.value))}
              disabled={draftStyle !== 'human'}
              style={{
                ...sliderStyle,
                opacity: draftStyle !== 'human' ? 0.4 : 1,
              }}
            />
            <span id="newgame-difficulty-value" style={{ minWidth: '50px' }}>
              {formatKyu(draftDifficulty)}
            </span>
          </div>

          {/* Play style */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={labelStyle}>플레이 스타일</span>
            <button
              type="button"
              id="newgame-style-human"
              style={btnStyle(draftStyle === 'human')}
              onClick={() => setDraftStyle('human')}
            >
              인간 스타일
            </button>
            <button
              type="button"
              id="newgame-style-strong"
              style={btnStyle(draftStyle === 'strong')}
              onClick={() => setDraftStyle('strong')}
            >
              강한 AI
            </button>
          </div>

          {!engineEnabled && (
            <div
              id="newgame-engine-off-notice"
              style={{
                color: '#e0a060',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              엔진이 꺼져 있습니다. 시작 후 설정(⚙)에서 엔진을 켤 수 있습니다.
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          marginTop: '4px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 18px',
            borderRadius: '6px',
            border: '1px solid #3b3b5c',
            background: 'transparent',
            color: '#e0e0e0',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          취소
        </button>
        <button
          type="button"
          id="new-game-start"
          onClick={handleStart}
          style={{
            padding: '8px 18px',
            borderRadius: '6px',
            border: 'none',
            background: '#5a7fb5',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          대국 시작
        </button>
      </div>
    </Modal>
  )
}
