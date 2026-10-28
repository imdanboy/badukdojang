import { test, expect } from '@playwright/test'

/**
 * Layout tests for the one-screen shell:
 * - Board.tsx fits the largest square to the REAL board-column slot (both
 *   width and height measured with ResizeObserver; no guessed height cap).
 * - `.shudan-content` (the stone grid itself) must therefore fill most of
 *   the slot's min(w, h) — not merely exceed some fraction of the viewport.
 * - The shell is exactly one viewport tall: NO page-level scrolling on any
 *   viewport; only designated panels (.side-col, the tree panel) scroll.
 * - No horizontal overflow anywhere.
 */

const DESKTOP_VIEWPORTS: Array<[number, number, string]> = [
  [1440, 900, 'wide desktop'],
  [1280, 640, 'short desktop'],
  [1024, 768, 'landscape/tablet'],
]

async function measureLayout(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const colBox = (() => {
      const el = document.querySelector('.board-col')
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        width: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        height: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      }
    })()
    const content = document.querySelector('.shudan-content')!.getBoundingClientRect()
    return {
      col: colBox,
      content: { width: content.width, height: content.height },
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageOverflowY:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })
}

for (const [w, h, label] of DESKTOP_VIEWPORTS) {
  test(`desktop ${w}x${h} (${label}): board fills the real column slot, no overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await expect(page.locator('#playback-first')).toHaveCount(1)

    // No horizontal overflow
    const before = await measureLayout(page)
    expect(before.col).toBeTruthy()
    expect(before.overflowX).toBeLessThanOrEqual(0)

    // The stone grid is square and fills most of the ACTUAL available slot
    // (min of the measured column dimensions) — on both axes.
    const avail = Math.min(before.col!.width, before.col!.height)
    expect(before.content.width).toBeCloseTo(before.content.height, 1)
    expect(before.content.width).toBeGreaterThan(avail * 0.8)
    expect(before.content.height).toBeGreaterThan(avail * 0.8)
    // ...and the goban wrapper must not overflow the slot either.
    const gobanOver = await page.evaluate(() => {
      const col = document.querySelector('.board-col')!
      const goban = document.querySelector('.shudan-goban')!
      const c = col.getBoundingClientRect()
      const g = goban.getBoundingClientRect()
      return {
        dx: g.width - (c.width - 8),
        dy: g.height - (c.height - 8),
      }
    })
    expect(gobanOver.dx).toBeLessThanOrEqual(12)
    expect(gobanOver.dy).toBeLessThanOrEqual(12)

    // Playback bar lives inside the right function column, right of the board.
    const boardBox = (await page.locator('.board-container').boundingBox())!
    const playBox = (await page.locator('.playback-bar').boundingBox())!
    expect(playBox.x).toBeGreaterThan(boardBox.x + boardBox.width - 1)
    await expect(page.locator('#playback-first')).toHaveCount(1)
    await page.screenshot({ path: `/tmp/layout-${w}x${h}.png` })
  })
}

test('short desktop: sidebar scrolls internally, board keeps its slot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.goto('/')
  await expect(page.locator('#playback-first')).toHaveCount(1)

  const m = await measureLayout(page)
  expect(m.overflowX).toBeLessThanOrEqual(0)
  const avail = Math.min(m.col!.width, m.col!.height)
  expect(m.content.width).toBeCloseTo(m.content.height, 1)
  expect(m.content.width).toBeGreaterThan(avail * 0.8)

  // If the sidebar is taller than the slot it must scroll INSIDE the side
  // column (app shell is fixed-height), never at page level, so the board
  // slot keeps its height.
  const sideScroll = await page.evaluate(() => {
    const el = document.querySelector('.side-col')!
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  })
  if (sideScroll.scrollHeight > sideScroll.clientHeight + 2) {
    expect(m.content.height).toBeGreaterThan(avail * 0.8)
    // Page itself must not scroll; board stays put.
    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }))
    expect(doc.sw).toBeLessThanOrEqual(doc.cw)
  }

  // Playback bar remains fully visible (sticky at the top of the scroll area).
  const sticky = await page.evaluate(() => {
    const bar = document.querySelector('.playback-bar')!
    const side = document.querySelector('.side-col')!
    return bar.getBoundingClientRect().top >= side.getBoundingClientRect().top - 1
  })
  expect(sticky).toBe(true)
})

test('mobile portrait 390x844: width-bound board, no page-level overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('#playback-first')).toHaveCount(1)

  const m = await measureLayout(page)
  expect(m.overflowX).toBeLessThanOrEqual(0)
  // One-screen goal: the page itself never scrolls vertically — the
  // right/controls region is the designated internal scroll container.
  expect(m.pageOverflowY).toBeLessThanOrEqual(0)
  // Width-bound: the grid uses most of the column width (square keeps its
  // geometry; the extra height is the coordinate chrome/padding).
  expect(m.content.width).toBeCloseTo(m.content.height, 1)
  expect(m.content.width).toBeGreaterThan(m.col!.width * 0.8)
  await page.screenshot({ path: '/tmp/layout-390x844.png' })
})

test('zen mode: board fills the viewport slot on desktop, tree dock hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByTitle('집중 모드').click()
  await expect(page.locator('.shudan-content')).toBeVisible()

  const m = await page.evaluate(() => {
    const el = document.querySelector('.board-col')!
    return {
      col: { width: el.clientWidth, height: el.clientHeight },
      content: document.querySelector('.shudan-content')!.getBoundingClientRect().width,
      dockCount: document.querySelectorAll('[data-testid="tree-dock"]').length,
      pageOverflowY:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })
  expect(m.col.width).toBeGreaterThan(1200) // full width, no side columns
  expect(m.content).toBeGreaterThan(Math.min(m.col.width, m.col.height) * 0.8)
  // Zen is board-first: the tree dock never appears and the page stays put.
  expect(m.dockCount).toBe(0)
  expect(m.pageOverflowY).toBeLessThanOrEqual(0)
})

test('desktop: tree dock is hidden by default, opens at the bottom, no page scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('#playback-first')).toHaveCount(1)

  // Hidden by default.
  await expect(page.locator('[data-testid="tree-dock"]')).toHaveCount(0)

  // Toggle it on from the ReviewPanel.
  await page.locator('#tree-toggle').click()
  await expect(page.locator('[data-testid="tree-dock"]')).toHaveCount(1)

  const m = await page.evaluate(() => {
    const board = document.querySelector('.board-container')!.getBoundingClientRect()
    const panel = document.querySelector('[data-testid="game-tree-panel"]')!.getBoundingClientRect()
    const dock = document.querySelector('[data-testid="tree-dock"]')!.getBoundingClientRect()
    const review = document.querySelector('.review-panel')!.getBoundingClientRect()
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      boardBottom: board.bottom,
      dockTop: dock.top,
      dockBottom: dock.bottom,
      panelTop: panel.top,
      panelLeft: panel.left,
      panelRight: panel.right,
      panelWidth: panel.width,
      reviewWidth: review.width,
      pageOverflowY:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })

  // The dock sits at the bottom of the same viewport — below the stage.
  expect(m.dockTop).toBeGreaterThanOrEqual(m.boardBottom + 8)
  expect(m.dockBottom).toBeLessThanOrEqual(m.viewport.height + 1)
  // It spans the whole app content width (rail + board + right functions):
  // wider than the review sidebar and hugging the content-box edges
  // (shell padding is 16px).
  expect(m.panelWidth).toBeGreaterThan(m.reviewWidth + 10)
  expect(m.panelLeft).toBeLessThanOrEqual(32)
  expect(m.viewport.width - m.panelRight).toBeLessThanOrEqual(32)

  // One-screen: page-level scroll is gone in both axes.
  expect(m.pageOverflowY).toBeLessThanOrEqual(0)
  expect(m.overflowX).toBeLessThanOrEqual(0)
})

test('desktop long game: tree scrolls horizontally inside the dock, page stays put', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForSelector('.shudan-goban')
  await page.locator('#tree-toggle').click()
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('e2e/fixtures/review-long-line.sgf')
  await page.waitForTimeout(300)

  const m = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="game-tree-panel"]') as HTMLElement
    return {
      nodes: panel.querySelectorAll('[data-tree-node]').length,
      scrollWidth: panel.scrollWidth,
      clientWidth: panel.clientWidth,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageOverflowY:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })
  // 80 moves + root = 81 nodes; the pitch cannot fit into 1440px.
  expect(m.nodes).toBe(81)
  expect(m.scrollWidth).toBeGreaterThan(m.clientWidth)
  // Page never scrolls — only the tree panel itself does.
  expect(m.overflowX).toBeLessThanOrEqual(0)
  expect(m.pageOverflowY).toBeLessThanOrEqual(0)
})

test('mobile portrait: toggled tree docks below the stage without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.waitForSelector('.shudan-goban')
  await page.locator('#tree-toggle').click()
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('e2e/fixtures/review-long-line.sgf')
  await page.waitForTimeout(300)

  const m = await page.evaluate(() => {
    const panel = (
      document.querySelector('[data-testid="game-tree-panel"]') as HTMLElement
    ).getBoundingClientRect()
    const board = document.querySelector('.board-container')!.getBoundingClientRect()
    return {
      panelTop: panel.top,
      boardBottom: board.bottom,
      panelWidth: panel.width,
      panelBottom: panel.bottom,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageOverflowY:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })
  // Docked below the board (there is no side column row above it).
  expect(m.panelTop).toBeGreaterThan(m.boardBottom)
  expect(m.panelBottom).toBeLessThanOrEqual(m.innerHeight + 1)
  // Spans the viewport without page-level overflow in either axis.
  expect(m.panelWidth).toBeGreaterThan(m.innerWidth * 0.9)
  expect(m.overflowX).toBeLessThanOrEqual(0)
  expect(m.pageOverflowY).toBeLessThanOrEqual(0)
})
