/*
 * Toast — transient bottom-center notification, auto-dismissed by parent.
 */
export interface ToastProps {
  message: string
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#2a2a4e',
        color: '#e0e0e0',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        zIndex: 1500,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        border: '1px solid #3b3b5c',
        maxWidth: '90vw',
      }}
    >
      {message}
    </div>
  )
}
