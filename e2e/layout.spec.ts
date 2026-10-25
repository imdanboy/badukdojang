import { test, expect } from '@playwright/test'

/**
 * Layout tests for the board-fill strategy:
 * - Board.tsx fits the largest square to the REAL board-column slot (both
 *   width and height measured with ResizeObserver; no guessed height cap).
 * - `.shudan-content` (the stone grid itself) must therefore fill most of
 *   the slot's min(w, h) — not merely exceed some fraction of the viewport.
 * - No horizontal overflow anywhere; sidebar scrolls internally on short
 *   desktop windows instead of squeezing the board.
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

test('mobile portrait 390x844: width-bound board, no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('#playback-first')).toHaveCount(1)

  const m = await measureLayout(page)
  expect(m.overflowX).toBeLessThanOrEqual(0)
  // Width-bound: the grid uses most of the column width (square keeps its
  // geometry; the extra height is the coordinate chrome/padding).
  expect(m.content.width).toBeCloseTo(m.content.height, 1)
  expect(m.content.width).toBeGreaterThan(m.col!.width * 0.8)
  await page.screenshot({ path: '/tmp/layout-390x844.png' })
})

test('zen mode: board fills the viewport slot on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByTitle('집중 모드').click()
  await expect(page.locator('.shudan-content')).toBeVisible()

  const m = await page.evaluate(() => {
    const el = document.querySelector('.board-col')!
    return {
      col: { width: el.clientWidth, height: el.clientHeight },
      content: document.querySelector('.shudan-content')!.getBoundingClientRect().width,
    }
  })
  expect(m.col.width).toBeGreaterThan(1200) // full width, no side columns
  expect(m.content).toBeGreaterThan(Math.min(m.col.width, m.col.height) * 0.8)
})
