import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScreenshotImportModal } from './ScreenshotImportModal.tsx'

describe('ScreenshotImportModal', () => {
  it('선택 화면: 안내·선택 버튼·다시선택 없음·확정 없음', () => {
    const onClose = vi.fn()
    const onImport = vi.fn()
    render(
      <ScreenshotImportModal title="스크린샷 이어하기" onClose={onClose} onImport={onImport} />,
    )
    expect(screen.getByText(/진행 중인 대국의 스크린샷/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /이미지 선택/ })).toBeTruthy()
    expect(document.getElementById('screenshot-import-confirm')).toBeNull()
  })

  it('닫기 버튼이 onClose 를 호출', () => {
    const onClose = vi.fn()
    render(
      <ScreenshotImportModal title="스크린샷 이어하기" onClose={onClose} onImport={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
