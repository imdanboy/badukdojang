import '@testing-library/preact'

// jsdom does not provide ResizeObserver — mock it so Board tests render.
if (typeof ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: class ResizeObserver {
      private callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe(el: Element) {
        // Fire immediately with a fake size so the Board computes vertexSize.
        this.callback(
          [
            {
              target: el,
              contentRect: { width: 600, height: 600, top: 0, left: 0, bottom: 600, right: 600, x: 0, y: 0, toJSON: () => '' },
              borderBoxSize: [{ inlineSize: 600, blockSize: 600 }],
              contentBoxSize: [{ inlineSize: 600, blockSize: 600 }],
              devicePixelContentBoxSize: [{ inlineSize: 600, blockSize: 600 }],
            } as ResizeObserverEntry,
          ],
          this,
        )
      }
      unobserve() {}
      disconnect() {}
    },
    configurable: true,
  })
}

// jsdom in vitest may not provide localStorage by default.
// Provide a minimal in-memory mock so components that persist to
// localStorage work correctly in tests.
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem(key: string): string | null {
        return store.has(key) ? store.get(key)! : null
      },
      setItem(key: string, value: string): void {
        store.set(key, String(value))
      },
      removeItem(key: string): void {
        store.delete(key)
      },
      clear(): void {
        store.clear()
      },
      key(index: number): string | null {
        return Array.from(store.keys())[index] ?? null
      },
      get length(): number {
        return store.size
      },
    },
    configurable: true,
  })
}