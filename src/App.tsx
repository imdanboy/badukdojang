/*
 * badukdojang - T1 shell
 * Centered full-viewport container. No game logic yet; the @sabaki/*
 * board renderer (Shudan) will be mounted into this container in T2.
 */
export function App() {
  return (
    <div
      id="app-root"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '100svh',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, opacity: 0.6 }}>
        badukdojang &mdash; T1 shell ready
      </p>
    </div>
  )
}
