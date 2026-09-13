/*
 * Modal — generic modal shell: overlay, panel, header with close button,
 * Escape-to-close and click-outside-to-close.
 * Layout/visuals come from .modal-* classes in index.css.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** id for the close button (E2E/testing hook). */
  closeButtonId?: string
  /** aria-label for the close button. */
  closeLabel?: string
}

export function Modal({
  title,
  onClose,
  children,
  closeButtonId,
  closeLabel = '닫기',
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            id={closeButtonId}
            className="modal-close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
