import { useRef } from 'react'

export interface GameActionsRailProps {
  onNewGame: () => void
  onSaveSgf: () => void
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onImportScreenshot: () => void
}

export function GameActionsRail({
  onNewGame,
  onSaveSgf,
  onFileChange,
  onImportScreenshot,
}: GameActionsRailProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <aside className="board-rail" aria-label="대국 및 기보">
      <div className="board-rail-actions" role="group" aria-label="대국·기보 작업">
        <button
          className="board-rail-action"
          id="new-game-action"
          type="button"
          onClick={onNewGame}
          aria-label="새 대국"
          title="새 대국"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </button>
        <button
          className="board-rail-action"
          id="save-sgf-action"
          type="button"
          onClick={onSaveSgf}
          aria-label="기보 저장"
          title="기보 저장"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3h12l4 4v14H3V3h2Z" />
            <path d="M7 3v6h10V4M7 21v-8h10v8" />
          </svg>
        </button>
        <button
          className="board-rail-action"
          id="load-sgf-action"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="기보 불러오기"
          title="기보 불러오기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h7l2 2h9v12H3V6Z" />
            <path d="M12 17V10m0 0-3 3m3-3 3 3" />
          </svg>
        </button>
        <button
          className="board-rail-action"
          id="screenshot-import-action"
          type="button"
          onClick={onImportScreenshot}
          aria-label="스크린샷에서 이어하기"
          title="스크린샷에서 이어하기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          className="board-rail-file-input"
          type="file"
          accept=".sgf,text/plain"
          onChange={onFileChange}
          aria-label="기보 파일 선택"
        />
      </div>
    </aside>
  )
}
