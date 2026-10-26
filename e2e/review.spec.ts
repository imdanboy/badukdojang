import { test, expect, type Page } from '@playwright/test'

/**
 * Review features e2e (놓아보기):
 * - Move numbers on the stones of the selected line (selfplay mode).
 * - Complete game-tree visualization with variation navigation.
 * - Full-tree batch analysis with progress/cancel + winrate graph.
 *
 * The KataGo bridge is route-mocked; the game tree comes from a fixture
 * SGF with a variation fork after move 3.
 */

function mockEngine(page: Page): void {
  page.route('/api/gtp/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', version: '1.16.4', humanModelAvailable: true }),
    }),
  )
  page.route('/api/gtp/analyze', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ winrate: 0.6, scoreLead: 1.2, bestMoves: [], completed: true }),
    }),
  )
  page.route('/api/gtp/command', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: '' }),
    }),
  )
  page.route('/api/gtp/terminate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }),
  )
}

function vertexIndex(x: number, y: number, boardSize: number): number {
  return y * boardSize + x
}

async function loadVariationsSgf(page: Page): Promise<void> {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('e2e/fixtures/review-variations.sgf')
  await page.waitForTimeout(300)
}

test.describe('Review — move numbers', () => {
  test.beforeEach(async ({ page }) => {
    await mockEngine(page)
    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
    await loadVariationsSgf(page)
  })

  test('initially hidden, then all-mode numbers every stone on the line', async ({ page }) => {
    // No numbering until a button is used (full numbering is now the
    // explicit "전체 수순" mode, not the default).
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await expect(page.locator('#move-number-all')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#move-number-from-current')).toHaveAttribute('aria-pressed', 'false')

    await page.locator('#move-number-all').click()
    await expect(page.locator('#move-number-all')).toHaveAttribute('aria-pressed', 'true')

    // Main line has 5 moves; each surviving stone carries its number label.
    const labels = page.locator('.shudan-marker-label')
    await expect(labels).toHaveCount(5)
    await expect(page.locator('.shudan-marker-label:text-is("1")')).toHaveCount(1)
    await expect(page.locator('.shudan-marker-label:text-is("5")')).toHaveCount(1)

    // While all mode is on, the other toggle is disabled/non-actionable.
    await expect(page.locator('#move-number-from-current')).toBeDisabled()

    // Re-clicking 전체 수순 turns it off and removes all labels.
    await page.locator('#move-number-all').click()
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await expect(page.locator('#move-number-all')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#move-number-from-current')).toBeEnabled()
  })

  test('all-mode labels follow the selected branch and hide at the root', async ({ page }) => {
    await page.locator('#move-number-all').click()

    // Navigate to root via the tree — labels disappear with the stones.
    await page.locator('[data-tree-node][aria-label="시작 노드"]').click()
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await expect(page.locator('.shudan-stone')).toHaveCount(0)
  })

  test('from-current mode leaves existing stones unlabeled and numbers later moves from 1', async ({ page }) => {
    // Jump to the variation tip (5th move of the W[qe] branch) and turn on
    // "번호 표시": stones already on the board stay UNLABELED.
    await page.locator('[data-tree-node]').nth(7).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 5')
    await page.locator('#move-number-from-current').click()
    await expect(page.locator('#move-number-from-current')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)

    // The first move played after the press is numbered 1.
    await page.locator('.shudan-vertex').nth(vertexIndex(9, 9, 19)).click()
    await expect(page.locator('.shudan-marker-label:text-is("1")')).toHaveCount(1)

    // Re-click turns numbering off and removes the label.
    await page.locator('#move-number-from-current').click()
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await expect(page.locator('#move-number-from-current')).toHaveAttribute('aria-pressed', 'false')

    // Re-enable "번호 표시" here, then jump to the main-line tip: the anchor
    // is NOT an ancestor of that path → no labels and an off-path hint.
    await page.locator('#move-number-from-current').click()
    await page.locator('[data-tree-node]').nth(4).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 4')
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await expect(page.locator('#move-number-anchor-hint')).toContainText('경로 밖')

    // "전체 수순" still works from any position (move 4 → 4 stones).
    await page.locator('#move-number-all').click()
    await expect(page.locator('.shudan-marker-label')).toHaveCount(4)
    await expect(page.locator('.shudan-marker-label:text-is("4")')).toHaveCount(1)
  })

  test('loading a new SGF resets the numbering mode (no stale anchor)', async ({ page }) => {
    await page.locator('[data-tree-node]').nth(4).click()
    await page.locator('#move-number-from-current').click()
    // Anchor at Move 4: existing stones stay unlabeled until a new move
    // is played after the press.
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await page.locator('.shudan-vertex').nth(vertexIndex(9, 9, 19)).click()
    await expect(page.locator('.shudan-marker-label:text-is("1")')).toHaveCount(1)

    // Replace the game with the same SGF — node ids are regenerated, so the
    // numbering (and its anchor) must reset to hidden.
    await loadVariationsSgf(page)
    await expect(page.locator('.shudan-marker-label')).toHaveCount(0)
    await expect(page.locator('#move-number-anchor-hint')).toHaveCount(0)
    await expect(page.locator('#move-number-from-current')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('Review — game tree navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockEngine(page)
    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
    await loadVariationsSgf(page)
  })

  test('tree shows every node of the game incl. variations', async ({ page }) => {
    // root + 5 main-line moves + 2 variation moves = 8 nodes.
    await expect(page.locator('[data-tree-node]')).toHaveCount(8)
    // The current node (main-line tip) is marked.
    const current = page.locator('[data-tree-node][data-on-path="true"]')
    expect(await current.count()).toBeGreaterThanOrEqual(5)
  })

  test('clicking a variation node navigates board, counter, turn and branch', async ({ page }) => {
    // The 7th node (index 6) is the variation's first move W[qe]:
    // path = 4 moves, Black to play.
    await page.locator('[data-tree-node]').nth(6).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 4')
    await expect(page.locator('#turn-indicator')).toContainText('Black')

    // The board shows the variation position (5 stones: 4 moves + ...).
    // Moves: B[pd] W[dc] B[ce] W[qe] = 4 stones.
    await expect(page.locator('.shudan-stone')).toHaveCount(4)

    // Jump to the variation tip (last node): 5 moves on this branch,
    // White to play after Black's 5th move.
    await page.locator('[data-tree-node]').nth(7).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 5')
    await expect(page.locator('#turn-indicator')).toContainText('White')
    await expect(page.locator('.shudan-stone')).toHaveCount(5)

    // Undo/redo remain consistent relative to the navigated node.
    await page.locator('#playback-prev').click()
    await expect(page.locator('.playback-counter')).toContainText('Move 4')
    await page.locator('#playback-next').click()
    await expect(page.locator('.playback-counter')).toContainText('Move 5')
  })
})

test.describe('Review — full-tree batch analysis + winrate graph', () => {
  test.beforeEach(async ({ page }) => {
    await mockEngine(page)
    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
    await loadVariationsSgf(page)
    // Enable the engine so the batch can run.
    await page.locator('#settings-button').click()
    await page.locator('#engine-toggle').click()
    await page.locator('#settings-close').click()
  })

  test('analyzes all branches, shows progress, then graphs the branch', async ({ page }) => {
    await page.locator('#tree-analysis-start').click()

    // Progress UI while running.
    await expect(page.locator('#tree-analysis-progress')).toBeVisible()

    // All 7 move positions (5 main + 2 variation) are requested.
    await expect(page.locator('#tree-analysis-status')).toContainText('전체 분석 완료', {
      timeout: 15000,
    })

    // Winrate graph for the current branch (main line, 5 points).
    const points = page.locator('[data-winrate-point]')
    await expect(points).toHaveCount(5)
    // Black perspective: after odd moves White is to play → 1-0.6 = 0.4.
    await expect(points.nth(0)).toHaveAttribute('data-winrate', '0.400')
    await expect(points.nth(1)).toHaveAttribute('data-winrate', '0.600')

    // Clicking the move-2 point navigates to that node.
    await points.nth(1).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 2')

    // Switch to the variation branch: the graph follows the selected line.
    await page.locator('[data-tree-node]').nth(7).click()
    await expect(page.locator('.playback-counter')).toContainText('Move 5')
    await expect(points).toHaveCount(5)
  })

  test('cancel stops the run and reports partial progress', async ({ page }) => {
    // Replace the analyze mock with a hanging response.
    await page.unroute('/api/gtp/analyze')
    await page.route('/api/gtp/analyze', (route) => {
      // Never fulfills — the run must be cancelable.
      return new Promise(() => {})
    })

    await page.locator('#tree-analysis-start').click()
    await expect(page.locator('#tree-analysis-cancel')).toBeVisible()

    await page.locator('#tree-analysis-cancel').click()
    await expect(page.locator('#tree-analysis-status')).toContainText('취소됨')

    // Progress UI is gone; the start button is back for a resume run.
    await expect(page.locator('#tree-analysis-progress')).toHaveCount(0)
    await expect(page.locator('#tree-analysis-start')).toBeVisible()
  })

  test('mobile portrait keeps the review panel inside the column, no overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.waitForSelector('.shudan-goban')
    await loadVariationsSgf(page)

    const overflowX =
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    expect(overflowX).toBeLessThanOrEqual(0)
    // Tree panel scrolls internally instead of blowing up the layout.
    const treePanel = page.locator('[data-testid="game-tree-panel"]')
    await expect(treePanel).toBeVisible()
  })
})
