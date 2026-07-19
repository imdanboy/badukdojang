import { test, expect, type Page } from '@playwright/test'

function vertexIndex(x: number, y: number, boardSize: number): number {
  return y * boardSize + x
}

async function clickVertex(
  page: Page,
  x: number,
  y: number,
  boardSize: number,
): Promise<void> {
  const vertex = page.locator('.shudan-vertex').nth(vertexIndex(x, y, boardSize))
  await vertex.click()
}

const ENGINE_SETTINGS_KEY = 'badukdojang-engine-settings'

test.describe('Candidate Moves E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/gtp/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '1.16.4', humanModelAvailable: true }),
      })
    })

    await page.route('/api/gtp/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          winrate: 0.52,
          scoreLead: 1.5,
          bestMoves: [
            {
              move: 'D4',
              visits: 100,
              winrate: 0.54,
              scoreLead: 2.1,
              pv: ['D4', 'Q16', 'C3', 'R17'],
            },
            {
              move: 'Q16',
              visits: 80,
              winrate: 0.51,
              scoreLead: 1.2,
              pv: ['Q16', 'D4', 'R17', 'C3'],
            },
            {
              move: 'C3',
              visits: 60,
              winrate: 0.49,
              scoreLead: 0.8,
              pv: ['C3', 'D4', 'Q16', 'R17'],
            },
          ],
          completed: true,
        }),
      })
    })

    await page.route('/api/gtp/command', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
    await page.evaluate((key) => localStorage.removeItem(key), ENGINE_SETTINGS_KEY)
  })

  test('(a) after a move, A/B/C letter markers appear on the board', async ({
    page,
  }) => {
    // Enable the engine so analysis runs
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Play a move in self-play mode (default)
    await clickVertex(page, 3, 3, 19)

    // Wait for candidate markers to appear (letter labels on the board)
    await expect(async () => {
      const labels = page.locator('.shudan-vertex.shudan-marker_label')
      const count = await labels.count()
      expect(count).toBe(3)
    }).toPass({ timeout: 10000 })

    await page.screenshot({
      path: '.omo/evidence/task-12-katago-ai-integration-markers.png',
      fullPage: true,
    })
  })

  test('(b) sidebar shows 3 candidate rows with vertex, winrate, scoreLead, PV', async ({
    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await clickVertex(page, 3, 3, 19)

    // Wait for the candidate moves panel to appear
    await expect(async () => {
      const panel = page.locator('#candidate-moves-panel')
      await expect(panel).toBeVisible()
    }).toPass({ timeout: 10000 })

    // Should have exactly 3 candidate rows
    const rows = page.locator('.candidate-move-row')
    await expect(rows).toHaveCount(3)

    // Row A should have vertex D4, winrate 54.0%, scoreLead +2.1
    const rowA = page.locator('.candidate-move-row[data-letter="A"]')
    await expect(rowA).toHaveAttribute('data-vertex', 'D4')
    await expect(rowA).toContainText('54.0%')
    await expect(rowA).toContainText('+2.1')

    // Row B should have vertex Q16
    const rowB = page.locator('.candidate-move-row[data-letter="B"]')
    await expect(rowB).toHaveAttribute('data-vertex', 'Q16')

    // Row C should have vertex C3
    const rowC = page.locator('.candidate-move-row[data-letter="C"]')
    await expect(rowC).toHaveAttribute('data-vertex', 'C3')

    // PV preview should show first 5 moves (we only have 4 in mock)
    await expect(rowA).toContainText('D4 Q16 C3 R17')

    await page.screenshot({
      path: '.omo/evidence/task-12-katago-ai-integration-sidebar.png',
      fullPage: true,
    })
  })

  test('(c) clicking a candidate row plays the move on the board', async ({
    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Play first move at (3,3) = D4
    await clickVertex(page, 3, 3, 19)

    // Wait for candidates to appear
    await expect(async () => {
      const rows = page.locator('.candidate-move-row')
      const count = await rows.count()
      expect(count).toBe(3)
    }).toPass({ timeout: 10000 })

    // Count stones before clicking candidate (1 stone from our move)
    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    // Click candidate B (Q16 = vertex [15, 15])
    await page.locator('.candidate-move-row[data-letter="B"]').click()

    // A new stone should appear at Q16 (vertex [15, 15])
    await expect(async () => {
      stones = page.locator('.shudan-stone-image')
      const count = await stones.count()
      expect(count).toBe(2)
    }).toPass({ timeout: 5000 })

    await page.screenshot({
      path: '.omo/evidence/task-12-debug-after-click.png',
      fullPage: true,
    })

    // The stone at Q16 should exist (Q = x16, row 16 = y15)
    const q16Stone = page.locator(
      '.shudan-vertex[data-x="16"][data-y="15"] .shudan-stone-image',
    )
    await expect(q16Stone).toHaveCount(1)

    await page.screenshot({
      path: '.omo/evidence/task-12-katago-ai-integration-clicked.png',
      fullPage: true,
    })
  })

  test('(d) candidates are NOT shown in AI mode', async ({ page }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Switch to AI mode
    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Play a move
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(1000)

    // Candidate moves panel should NOT be visible in AI mode
    const panel = page.locator('#candidate-moves-panel')
    await expect(panel).toHaveCount(0)
  })

  test('evidence: full candidate moves screenshot', async ({ page }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await clickVertex(page, 3, 3, 19)

    // Wait for candidates
    await expect(async () => {
      const rows = page.locator('.candidate-move-row')
      const count = await rows.count()
      expect(count).toBe(3)
    }).toPass({ timeout: 10000 })

    await page.waitForTimeout(500)

    await page.screenshot({
      path: '.omo/evidence/task-12-katago-ai-integration.png',
      fullPage: true,
    })
  })
})