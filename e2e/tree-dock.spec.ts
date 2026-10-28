import { test, expect, type Page } from '@playwright/test'

/**
 * One-screen game-tree dock e2e:
 * - The page/document NEVER scrolls (no vertical, no horizontal) — the only
 *   scrollers are .side-col and the tree panel inside the dock.
 * - The tree dock is hidden by default and toggled from the ReviewPanel.
 * - With the dock open, board + tree share ONE viewport (the board stage
 *   shrinks by the dock height).
 * - The dock is vertically resizable by dragging the separator (pointer and
 *   keyboard); growing the tree shrinks the board stage by the same amount.
 * - Zen mode hides the dock again.
 */

async function pageScrollState(page: Page) {
  return page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowY:
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
}

async function boardContentHeight(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelector('.shudan-content')!.getBoundingClientRect().height,
  )
}

/** Height of the board's measured SLOT (stretched to the stage's leftover). */
async function boardSlotHeight(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelector('.board-container')!.getBoundingClientRect().height,
  )
}

/** Let the ResizeObserver → React re-render cycle settle after a layout change. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(300)
}

test.describe('Tree dock — toggle & one-screen fit (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('#playback-first')).toHaveCount(1)
  })

  test('hidden by default; toggle shows the dock; toggle off restores the board', async ({
    page,
  }) => {
    // Page itself never scrolls, even with the tree hidden.
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })
    await expect(page.locator('[data-testid="tree-dock"]')).toHaveCount(0)

    const fullBoard = await boardContentHeight(page)

    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
    await settle(page)
    await expect(page.locator('[data-testid="game-tree-panel"]')).toHaveCount(1)
    await expect(page.locator('#tree-toggle')).toHaveAttribute('aria-pressed', 'true')

    // One screen: the docked tree fits the viewport, the page never scrolls.
    const dockBox = (await page.locator('[data-testid="tree-dock"]').boundingBox())!
    expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(901)
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })

    // The board shrank to make room for the dock…
    const shrunkBoard = await boardContentHeight(page)
    expect(shrunkBoard).toBeLessThan(fullBoard)

    // …and toggling off restores the full board-first size.
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toHaveCount(0)
    await settle(page)
    expect(await boardContentHeight(page)).toBeCloseTo(fullBoard, 0)
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })
  })

  test('dock open: tree fits the same viewport and playback stays accessible', async ({
    page,
  }) => {
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
    await settle(page)

    const boxes = await page.evaluate(() => {
      const dock = document
        .querySelector('[data-testid="tree-dock"]')!
        .getBoundingClientRect()
      const stage = document.querySelector('.stage')!.getBoundingClientRect()
      const board = document.querySelector('.board-container')!.getBoundingClientRect()
      const panel = document
        .querySelector('[data-testid="game-tree-panel"]')!
        .getBoundingClientRect()
      return {
        innerHeight: window.innerHeight,
        dock: { top: dock.top, bottom: dock.bottom },
        stageBottom: stage.bottom,
        boardBottom: board.bottom,
        panel: { top: panel.top, bottom: panel.bottom, width: panel.width },
      }
    })

    // Dock below the board/stage, inside the viewport.
    expect(boxes.dock.top).toBeGreaterThanOrEqual(boxes.stageBottom - 1)
    expect(boxes.dock.top).toBeGreaterThanOrEqual(boxes.boardBottom - 1)
    expect(boxes.dock.bottom).toBeLessThanOrEqual(boxes.innerHeight + 1)
    // Tree panel inside the dock, both within the viewport.
    expect(boxes.panel.bottom).toBeLessThanOrEqual(boxes.innerHeight + 1)
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })

    // Right-side playback + primary actions stay reachable with the dock
    // open: play a stone, then last/first navigation still work.
    await page.locator('.shudan-vertex').nth(100).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 1')
    await page.locator('#playback-first').click()
    await expect(page.locator('.playback-counter')).toContainText('Move 0')
  })

  test('dragging the divider grows the tree and shrinks the board by the same amount', async ({
    page,
  }) => {
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()

    const dockBefore = (await page.locator('[data-testid="tree-dock"]').boundingBox())!
    const boardBefore = await boardContentHeight(page)
    const slotBefore = await boardSlotHeight(page)

    // Drag the separator up by 150px → the tree grows, the board shrinks.
    const resizer = (await page.locator('.tree-resizer').boundingBox())!
    await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + resizer.height / 2)
    await page.mouse.down()
    await page.mouse.move(resizer.x + resizer.width / 2, resizer.y - 150, { steps: 8 })
    await page.mouse.up()
    await settle(page)

    const dockAfter = (await page.locator('[data-testid="tree-dock"]').boundingBox())!
    const boardAfter = await boardContentHeight(page)
    const slotAfter = await boardSlotHeight(page)
    const treeGrew = dockAfter.height - dockBefore.height
    expect(treeGrew).toBeGreaterThan(120)
    // The board SLOT loses exactly what the tree gained (±2px rounding).
    expect(slotBefore - slotAfter).toBeGreaterThanOrEqual(treeGrew - 2)
    expect(slotBefore - slotAfter).toBeLessThanOrEqual(treeGrew + 2)
    // …and the stone grid actually re-rendered smaller (ResizeObserver ran).
    expect(boardAfter).toBeLessThan(boardBefore)
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })

    // Dragging back down shrinks the tree again (still no overflow).
    const resizer2 = (await page.locator('.tree-resizer').boundingBox())!
    await page.mouse.move(resizer2.x + resizer2.width / 2, resizer2.y + resizer2.height / 2)
    await page.mouse.down()
    await page.mouse.move(resizer2.x + resizer2.width / 2, resizer2.y + 260, { steps: 6 })
    await page.mouse.up()
    await settle(page)
    const dockShrunk = (await page.locator('[data-testid="tree-dock"]').boundingBox())!
    expect(dockShrunk.height).toBeLessThan(dockAfter.height)
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })
  })

  test('divider drag respects min/max bounds so a useful board remains', async ({
    page,
  }) => {
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()

    // Drag far past the maximum: the dock must stop before starving the board.
    const resizer = (await page.locator('.tree-resizer').boundingBox())!
    await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + resizer.height / 2)
    await page.mouse.down()
    await page.mouse.move(resizer.x + resizer.width / 2, 0, { steps: 10 })
    await page.mouse.up()
    await settle(page)

    const m = await page.evaluate(() => {
      const dock = document
        .querySelector('[data-testid="tree-dock"]')!
        .getBoundingClientRect()
      const resizer = document.querySelector('.tree-resizer') as HTMLElement
      return {
        dockHeight: dock.height,
        innerHeight: window.innerHeight,
        max: Number(resizer.getAttribute('aria-valuemax')),
        min: Number(resizer.getAttribute('aria-valuemin')),
        now: Number(resizer.getAttribute('aria-valuenow')),
      }
    })
    // Max = viewport − reserved minimal stage; never the whole viewport.
    expect(m.max).toBeLessThanOrEqual(m.innerHeight - 300)
    expect(m.dockHeight).toBeLessThanOrEqual(m.innerHeight - 300)
    expect(m.now).toBe(m.max)
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })
  })

  test('re-opening after a viewport shrink clamps the stored height (no overflow)', async ({
    page,
  }) => {
    // Store a tall dock height (jump to max = 600 @ 900)…
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
    await page.locator('.tree-resizer').focus()
    await page.keyboard.press('Home')
    await settle(page)

    // …hide the tree — the resize listener goes dormant with it…
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toHaveCount(0)

    // …shrink the viewport while hidden…
    await page.setViewportSize({ width: 1440, height: 500 })

    // …and re-open: the stored height (600) exceeds the new max (500 − 300
    // stage reserve = 200), so the dock must re-clamp on becoming visible or
    // the one-screen shell overflows/clips until another resize.
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
    await settle(page)

    const m = await page.evaluate(() => {
      const dock = document
        .querySelector('[data-testid="tree-dock"]')!
        .getBoundingClientRect()
      const resizer = document.querySelector('.tree-resizer') as HTMLElement
      const appRoot = document.getElementById('app-root')!
      return {
        dockHeight: dock.height,
        dockBottom: dock.bottom,
        now: Number(resizer.getAttribute('aria-valuenow')),
        max: Number(resizer.getAttribute('aria-valuemax')),
        innerHeight: window.innerHeight,
        page: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
        shell: { sw: appRoot.scrollHeight, ch: appRoot.clientHeight },
      }
    })
    // Dock height (rendered and reported) within the CURRENT aria-valuemax.
    expect(m.dockHeight).toBeLessThanOrEqual(m.max)
    expect(m.now).toBeLessThanOrEqual(m.max)
    // No page/app overflow: the docked tree fits the shortened viewport.
    expect(m.dockBottom).toBeLessThanOrEqual(m.innerHeight + 1)
    expect(m.page).toEqual({ x: 0, y: 0 })
    expect(m.shell.sw).toBeLessThanOrEqual(m.shell.ch)
  })

  test('divider is keyboard-resizable (role=separator, arrows, Home/End)', async ({
    page,
  }) => {
    await page.locator('#tree-toggle').click()
    const resizer = page.locator('.tree-resizer')
    await expect(resizer).toBeVisible()
    await expect(resizer).toHaveAttribute('role', 'separator')
    await expect(resizer).toHaveAttribute('aria-orientation', 'horizontal')

    await resizer.focus()
    const before = Number(await resizer.getAttribute('aria-valuenow'))
    await page.keyboard.press('ArrowUp')
    expect(Number(await resizer.getAttribute('aria-valuenow'))).toBeGreaterThan(before)
    await page.keyboard.press('ArrowDown')
    expect(Number(await resizer.getAttribute('aria-valuenow'))).toBe(before)
    await page.keyboard.press('End')
    expect(Number(await resizer.getAttribute('aria-valuenow'))).toBe(
      Number(await resizer.getAttribute('aria-valuemin')),
    )
    await page.keyboard.press('Home')
    expect(Number(await resizer.getAttribute('aria-valuenow'))).toBe(
      Number(await resizer.getAttribute('aria-valuemax')),
    )
    expect(await pageScrollState(page)).toEqual({ overflowX: 0, overflowY: 0 })
  })
})

test.describe('Tree dock — internal scrolling', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
    await page.locator('#tree-toggle').click()
  })

  test('wide tree scrolls horizontally inside the dock, page stays put', async ({
    page,
  }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('e2e/fixtures/review-long-line.sgf')
    await page.waitForTimeout(300)

    const m = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="game-tree-panel"]') as HTMLElement
      panel.scrollLeft = panel.scrollWidth // simulate the auto-scroll target
      return {
        scrollWidth: panel.scrollWidth,
        clientWidth: panel.clientWidth,
        scrollLeft: panel.scrollLeft,
        page: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
      }
    })
    expect(m.scrollWidth).toBeGreaterThan(m.clientWidth)
    expect(m.scrollLeft).toBeGreaterThan(0)
    expect(m.page).toEqual({ x: 0, y: 0 })
  })

  test('deeply branched tree scrolls vertically inside the dock, page stays put', async ({
    page,
  }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('e2e/fixtures/review-many-branches.sgf')
    await page.waitForTimeout(300)

    const m = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="game-tree-panel"]') as HTMLElement
      panel.scrollTop = panel.scrollHeight
      return {
        nodes: panel.querySelectorAll('[data-tree-node]').length,
        scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight,
        scrollTop: panel.scrollTop,
        page: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
      }
    })
    // Root + 3 moves + 14 unique branch children → far more rows than the
    // dock height can show at once.
    expect(m.nodes).toBe(17)
    expect(m.scrollHeight).toBeGreaterThan(m.clientHeight)
    expect(m.scrollTop).toBeGreaterThan(0)
    expect(m.page).toEqual({ x: 0, y: 0 })
  })
})

test.describe('Tree dock — side column & zen', () => {
  test('short desktop: only .side-col scrolls internally, page never scrolls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 360 })
    await page.goto('/')
    await expect(page.locator('#playback-first')).toHaveCount(1)

    const m = await page.evaluate(() => {
      const side = document.querySelector('.side-col') as HTMLElement
      const before = side.scrollTop
      side.scrollTop = side.scrollHeight // scroll INSIDE the column
      const bar = document.querySelector('.playback-bar')!.getBoundingClientRect()
      return {
        scrollable: side.scrollHeight > side.clientHeight,
        scrollTopAfter: side.scrollTop,
        before,
        stickyTop: bar.top,
        sideTop: side.getBoundingClientRect().top,
        page: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
      }
    })
    expect(m.scrollable).toBe(true)
    expect(m.scrollTopAfter).toBeGreaterThan(m.before)
    // Sticky playback bar stays pinned at the top of the scroll area.
    expect(m.stickyTop).toBeGreaterThanOrEqual(m.sideTop - 1)
    expect(m.page).toEqual({ x: 0, y: 0 })
  })

  test('zen mode hides the tree dock and keeps the board-first stage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()

    await page.getByTitle('집중 모드').click()
    await expect(page.locator('.shudan-content')).toBeVisible()
    await settle(page)

    const m = await page.evaluate(() => {
      const col = document.querySelector('.board-col')!
      return {
        dockCount: document.querySelectorAll('[data-testid="tree-dock"]').length,
        colWidth: col.clientWidth,
        content: document.querySelector('.shudan-content')!.getBoundingClientRect().width,
        page: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
      }
    })
    expect(m.dockCount).toBe(0)
    expect(m.colWidth).toBeGreaterThan(1200)
    expect(m.content).toBeGreaterThan(600) // board-first full height
    expect(m.page).toEqual({ x: 0, y: 0 })

    // Exiting zen restores the docked tree.
    await page.locator('#zen-exit').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
  })
})

test.describe('Tree dock — mobile portrait', () => {
  async function mobileSnapshot(page: Page) {
    return page.evaluate(() => {
      const grid = document.querySelector('.shudan-content')!.getBoundingClientRect()
      const slot = document.querySelector('.board-container')!.getBoundingClientRect()
      const col = document.querySelector('.board-col')!.getBoundingClientRect()
      const dock = document
        .querySelector('[data-testid="tree-dock"]')
        ?.getBoundingClientRect() ?? null
      const side = document.querySelector('.side-col') as HTMLElement
      const appRoot = document.getElementById('app-root')!
      return {
        inner: { w: window.innerWidth, h: window.innerHeight },
        grid: { w: grid.width, h: grid.height, bottom: grid.bottom, right: grid.right },
        slot: { h: slot.height, bottom: slot.bottom },
        colW: col.width,
        dock: dock ? { top: dock.top, bottom: dock.bottom, h: dock.height } : null,
        side: {
          scrollable: side.scrollHeight > side.clientHeight,
          clientH: side.clientHeight,
        },
        page: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
        shell: { sw: appRoot.scrollHeight, ch: appRoot.clientHeight },
      }
    })
  }

  test('baseline board is width-bound and maximal with the dock hidden', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('#playback-first')).toHaveCount(1)
    await settle(page)

    const base = await mobileSnapshot(page)
    expect(base.dock).toBeNull()
    // Width-bound square: uses most of the column width, grid is square,
    // and the board lives inside its slot (nothing clipped).
    expect(base.grid.w).toBeGreaterThan(base.colW * 0.8)
    expect(base.grid.h).toBeCloseTo(base.grid.w, 1)
    expect(base.grid.bottom).toBeLessThanOrEqual(base.slot.bottom + 1)
    // One screen, no page/shell overflow.
    expect(base.page).toEqual({ x: 0, y: 0 })
    expect(base.shell.sw).toBeLessThanOrEqual(base.shell.ch)
  })

  test('dock open + divider dragged near max: board shrinks, stays above the divider', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('#playback-first')).toHaveCount(1)
    await settle(page)
    const base = await mobileSnapshot(page)

    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
    await settle(page)
    const open = await mobileSnapshot(page)

    // Docked tree fits the viewport; board gave up height (height-bound).
    expect(open.dock!.h).toBeGreaterThan(0)
    expect(open.dock!.bottom).toBeLessThanOrEqual(open.inner.h + 1)
    expect(open.grid.h).toBeLessThan(base.grid.h)
    expect(open.grid.bottom).toBeLessThanOrEqual(open.dock!.top + 1)
    expect(open.page).toEqual({ x: 0, y: 0 })

    // Drag the divider up near the maximum: the tree grows, the board
    // shrinks further and never collides with the dock.
    const rz = (await page.locator('.tree-resizer').boundingBox())!
    await page.mouse.move(rz.x + rz.width / 2, rz.y + rz.height / 2)
    await page.mouse.down()
    await page.mouse.move(rz.x + rz.width / 2, Math.max(rz.y - 400, 0), { steps: 10 })
    await page.mouse.up()
    await settle(page)

    const max = await mobileSnapshot(page)
    expect(max.dock!.h).toBeGreaterThan(open.dock!.h)
    expect(max.grid.h).toBeLessThan(open.grid.h)
    // Fully visible above the tree divider — not clipped, not overlapping.
    expect(max.grid.bottom).toBeLessThanOrEqual(max.dock!.top + 1)
    expect(max.grid.h).toBeLessThanOrEqual(max.slot.h)
    expect(max.grid.bottom).toBeLessThanOrEqual(max.slot.bottom + 1)
    // No document/shell overflow anywhere.
    expect(max.page).toEqual({ x: 0, y: 0 })
    expect(max.shell.sw).toBeLessThanOrEqual(max.shell.ch)

    // Side controls remain reachable via internal scrolling.
    expect(max.side.scrollable).toBe(true)
    const scrolled = await page.evaluate(() => {
      const side = document.querySelector('.side-col') as HTMLElement
      side.scrollTop = side.scrollHeight
      return side.scrollTop
    })
    expect(scrolled).toBeGreaterThan(0)
  })

  test('short landscape 844x390: dock stays minimal, board visible, no overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/')
    await expect(page.locator('#playback-first')).toHaveCount(1)
    await settle(page)

    // Even with the dock hidden, height is the limiting axis here: the
    // board must still fit its slot without page/shell overflow.
    const base = await mobileSnapshot(page)
    expect(base.page).toEqual({ x: 0, y: 0 })
    expect(base.shell.sw).toBeLessThanOrEqual(base.shell.ch)
    expect(base.grid.h).toBeLessThanOrEqual(base.slot.h)
    expect(base.grid.bottom).toBeLessThanOrEqual(base.slot.bottom + 1)

    // Opening the dock clamps to the adaptive minimum (25% of the height).
    await page.locator('#tree-toggle').click()
    await expect(page.locator('[data-testid="tree-dock"]')).toBeVisible()
    await settle(page)
    const open = await mobileSnapshot(page)
    expect(open.dock!.h).toBeLessThanOrEqual(390 * 0.25 + 1)
    expect(open.dock!.bottom).toBeLessThanOrEqual(open.inner.h + 1)
    expect(open.grid.bottom).toBeLessThanOrEqual(open.dock!.top + 1)
    expect(open.page).toEqual({ x: 0, y: 0 })
    expect(open.side.scrollable).toBe(true)
  })
})
