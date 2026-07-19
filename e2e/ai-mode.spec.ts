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

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `.omo/evidence/task-6-katago-ai-integration-${name}.png`,
    fullPage: true,
  })
}

const ENGINE_SETTINGS_KEY = 'badukdojang-engine-settings'

test.describe('AI Mode E2E', () => {
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
          bestMoves: [{ move: 'D5', visits: 100, winrate: 0.5, scoreLead: 0 }],
        }),
      })
    })

    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'D5' }),
        })
        return
      }

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

  test('(a) toggle AI mode and play a move → AI responds with a stone', async ({
    page,
  }) => {
    // Enable the engine before entering AI mode
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Toggle to AI mode
    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Place human stone at (3,3) — D4
    await clickVertex(page, 3, 3, 19)

    // Wait up to 10 seconds for AI response (human + AI = 2 stones)
    await expect(async () => {
      const stones = page.locator('.shudan-stone-image')
      const count = await stones.count()
      expect(count).toBe(2)
    }).toPass({ timeout: 10000 })

    // Verify AI stone is white (sign_-1)
    const whiteStone = page.locator(
      '.shudan-vertex.shudan-sign_-1 .shudan-stone-image',
    )
    await expect(whiteStone).toHaveCount(1)

    // Turn should be back to Black
    const turnIndicator = page.locator('text=To Play:')
    await expect(turnIndicator).toContainText('Black')

    await screenshot(page, 'ai-response')
  })

  test('(b) engine offline warning toast when AI mode selected with engine off', async ({
    page,
  }) => {
    // Unmock the route so the engine appears offline
    await page.unroute('/api/gtp/command')

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    // Toggle to AI mode
    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Toast should appear
    const toast = page.locator('role=alert')
    await expect(toast).toContainText('엔진이 꺼져 있습니다')

    await screenshot(page, 'engine-offline-toast')
  })

  test('(c) rapid human clicks do not trigger multiple AI moves', async ({
    page,
  }) => {
    // Slow down the mock response so we can test race protection
    await page.unroute('/api/gtp/command')
    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'D5' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Click two vertices rapidly
    await clickVertex(page, 3, 3, 19)
    await clickVertex(page, 5, 5, 19)

    // Wait for any AI response
    await page.waitForTimeout(1500)

    // Only 2 stones total (1 human + 1 AI) — the second click was blocked
    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(2)

    await screenshot(page, 'race-guard')
  })

  test('(d) mode switch mid-game shows confirmation dialog', async ({
    page,
  }) => {
    // Enable the engine before entering AI mode
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Start in self-play, place a stone
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    // Set up dialog handler to dismiss
    page.on('dialog', (dialog) => dialog.dismiss())

    // Try to switch to AI mode
    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Stone should still be there (game not reset)
    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    await screenshot(page, 'mode-switch-cancelled')
  })

  test('(e) confirming mode switch resets the game', async ({ page }) => {
    // Enable the engine before entering AI mode
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Place a stone
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    // Accept the confirmation dialog
    page.on('dialog', (dialog) => dialog.accept())

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(500)

    // Board should be empty after reset
    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    // Turn should be Black
    const turnIndicator = page.locator('text=To Play:')
    await expect(turnIndicator).toContainText('Black')

    await screenshot(page, 'mode-switch-confirmed')
  })

  test('(f) AI Move button manually triggers engine move', async ({ page }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Place human move
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(500)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(2)

    // Undo the AI move (so we can test manual trigger)
    await page.locator('button:has-text("Undo")').click()
    await page.waitForTimeout(300)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    // Click AI Move button
    await page.locator('#ai-move-btn').click()

    // Wait for AI stone
    await expect(async () => {
      stones = page.locator('.shudan-stone-image')
      const count = await stones.count()
      expect(count).toBe(2)
    }).toPass({ timeout: 10000 })

    await screenshot(page, 'manual-ai-move')
  })

  test('(g) AI plays a full 10-move game against itself without errors', async ({ page }) => {
    let moveCount = 0
    await page.unroute('/api/gtp/command')
    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        const moves = ['D5', 'E6', 'F7', 'G8', 'H9']
        const move = moves[moveCount % moves.length]!
        moveCount++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: move }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Play 5 human moves; AI responds to each → 10 stones total
    for (let i = 0; i < 5; i++) {
      await clickVertex(page, 3 + i, 3 + i, 19)
      await page.waitForTimeout(600)
    }

    // Should have 10 stones (5 human + 5 AI)
    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(10)

    // Turn should be back to Black
    const turnIndicator = page.locator('text=To Play:')
    await expect(turnIndicator).toContainText('Black')

    await screenshot(page, '10-move-selfplay')
  })

  test('(h) invalid response: off-board move → toast, no crash', async ({ page }) => {
    await page.unroute('/api/gtp/command')
    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'Z99' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(800)

    // Toast should appear
    const toast = page.locator('role=alert')
    await expect(toast).toContainText('AI 오류')

    // Board should still be playable (1 human stone, no crash)
    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    await screenshot(page, 'invalid-move-toast')
  })

  test('(i) race condition: rapid mode switches do not leave ghost stones stuck', async ({ page }) => {
    // Slow down AI response so we can switch modes while thinking
    await page.unroute('/api/gtp/command')
    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        await new Promise((resolve) => setTimeout(resolve, 800))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'D5' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Start a move (triggers thinking)
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(300)

    // Rapidly switch to self-play and back to AI (accepting reset dialogs)
    page.on('dialog', (dialog) => dialog.accept())
    await page.locator('#mode-selfplay').click()
    await page.waitForTimeout(200)
    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    // Board should be empty after reset
    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    // No ghost stones should remain (they would have shudan-ghost class)
    const ghosts = page.locator('.shudan-ghost')
    await expect(ghosts).toHaveCount(0)

    await screenshot(page, 'mode-switch-race-guard')
  })

  test('(j) hung command: thinking indicator clears on timeout', async ({ page }) => {
    test.setTimeout(40000)

    await page.unroute('/api/gtp/command')
    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    // Enable engine so the engine-off toast doesn't appear
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    await clickVertex(page, 3, 3, 19)

    await page.waitForTimeout(500)

    const aiMoveBtn = page.locator('#ai-move-btn')
    await expect(aiMoveBtn).toBeDisabled()

    await expect(async () => {
      const toast = page.locator('role=alert')
      const text = await toast.textContent()
      expect(text).toMatch(/엔진 오류|timed out/)
    }).toPass({ timeout: 35000 })

    await expect(aiMoveBtn).toBeEnabled()

    await screenshot(page, 'timeout-recovery')
  })

  test('evidence: ghost stone and blue flash screenshots', async ({ page }) => {
    await page.unroute('/api/gtp/command')
    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'genmove') {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'D5' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    await clickVertex(page, 3, 3, 19)

    await page.waitForTimeout(800)

    await page.screenshot({
      path: '.omo/evidence/task-7-katago-ai-integration.png',
      fullPage: true,
    })

    await page.waitForTimeout(1500)

    await page.screenshot({
      path: '.omo/evidence/task-8-katago-ai-integration.png',
      fullPage: true,
    })
  })

  test('(k) ownership heatmap overlay toggles on and shows colored tints', async ({ page }) => {
    // Ownership gradient: top-left → Black (positive), bottom-right → White (negative).
    const boardSize = 19
    const ownership = new Array<number>(boardSize * boardSize)
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const dx = x - boardSize / 2
        const dy = y - boardSize / 2
        const v = (dx + dy) / boardSize
        ownership[y * boardSize + x] = Math.max(-1, Math.min(1, v * 2))
      }
    }

    await page.unroute('/api/gtp/analyze')
    await page.route('/api/gtp/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bestMoves: [{ move: 'D5', visits: 100, winrate: 0.5, scoreLead: 0 }],
          ownership,
        }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)
    await clickVertex(page, 3, 3, boardSize)

    // The Ownership button is disabled until analysis returns ownership data.
    await expect(async () => {
      const btn = page.locator('#ownership-toggle')
      await expect(btn).toBeEnabled()
    }).toPass({ timeout: 10000 })

    await expect(page.locator('.ownership-overlay')).toHaveCount(0)

    await page.locator('#ownership-toggle').click()
    await page.waitForTimeout(200)

    const overlay = page.locator('.ownership-overlay')
    await expect(overlay).toHaveCount(1)
    const circles = overlay.locator('circle')
    const circleCount = await circles.count()
    expect(circleCount).toBeGreaterThan(0)

    await page.locator('#ownership-toggle').click()
    await page.waitForTimeout(200)
    await expect(page.locator('.ownership-overlay')).toHaveCount(0)

    await page.locator('#ownership-toggle').click()
    await page.waitForTimeout(300)

    await page.screenshot({
      path: '.omo/evidence/task-11-katago-ai-integration.png',
      fullPage: true,
    })
  })

  test('(l) winrate bar updates within 5s after a move when engine enabled', async ({ page }) => {
    // Override analyze mock to return a specific Black winrate (0.532 → 53.2%).
    await page.unroute('/api/gtp/analyze')
    await page.route('/api/gtp/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          winrate: 0.532,
          scoreLead: 1.5,
          bestMoves: [{ move: 'D5', visits: 100, winrate: 0.532, scoreLead: 1.5 }],
          completed: true,
        }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    // Enable the engine so the winrate panel is active.
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Panel should be in idle state before any move.
    const panel = page.locator('#analysis-panel')
    await expect(panel).toHaveAttribute('data-state', 'idle')

    // Place a stone in self-play mode (winrate fetch fires on any move).
    await clickVertex(page, 3, 3, 19)

    // Winrate label should show "53.2%" within 5 seconds.
    await expect(page.locator('#winrate-label')).toContainText('53.2%', { timeout: 5000 })

    // Bar fill widths should reflect the winrate (inline style uses percentages).
    const blackBar = page.locator('#winrate-bar-black')
    await expect(blackBar).toHaveAttribute('style', /width:\s*53\.2%/)
    const whiteBar = page.locator('#winrate-bar-white')
    await expect(whiteBar).toHaveAttribute('style', /width:\s*46\.8%/)

    await page.screenshot({
      path: '.omo/evidence/task-9-katago-ai-integration.png',
      fullPage: true,
    })
  })

  test('(m) scoreLead (집 차이) text updates within 5s after a move', async ({ page }) => {
    // Override analyze mock to return a positive scoreLead (Black ahead).
    await page.unroute('/api/gtp/analyze')
    await page.route('/api/gtp/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          winrate: 0.55,
          scoreLead: 5.3,
          bestMoves: [{ move: 'D5', visits: 100, winrate: 0.55, scoreLead: 5.3 }],
          completed: true,
        }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    // Enable the engine so the analysis panel is active.
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Place a stone to trigger the analysis fetch.
    await clickVertex(page, 3, 3, 19)

    // Score lead text should show "흑 +5.3" within 5 seconds.
    await expect(page.locator('#score-lead')).toHaveText('집 차이: 흑 +5.3', {
      timeout: 5000,
    })

    // Switch the mock to a negative scoreLead (White ahead) and re-fetch.
    await page.unroute('/api/gtp/analyze')
    await page.route('/api/gtp/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          winrate: 0.45,
          scoreLead: -2.1,
          bestMoves: [{ move: 'D5', visits: 100, winrate: 0.45, scoreLead: -2.1 }],
          completed: true,
        }),
      })
    })

    // Place another stone to retrigger analysis with the new mock.
    await clickVertex(page, 15, 15, 19)

    // Score lead text should now show "백 +2.1" within 5 seconds.
    await expect(page.locator('#score-lead')).toHaveText('집 차이: 백 +2.1', {
      timeout: 5000,
    })

    await page.screenshot({
      path: '.omo/evidence/task-10-katago-ai-integration.png',
      fullPage: true,
    })
  })

  test('(n) engine offline: 503 response shows error modal with 재시작 button', async ({ page }) => {
    await page.unroute('/api/gtp/health')
    await page.unroute('/api/gtp/command')
    await page.unroute('/api/gtp/analyze')

    await page.route('/api/gtp/health', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '엔진 연결 실패' }),
      })
    })
    await page.route('/api/gtp/command', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '엔진 연결 실패' }),
      })
    })
    await page.route('/api/gtp/analyze', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '엔진 연결 실패' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(500)

    const modal = page.locator('role=dialog')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('엔진 오류')
    await expect(modal).toContainText('엔진 연결 실패')

    const restartBtn = modal.locator('button:has-text("재시작")')
    await expect(restartBtn).toBeVisible()

    await screenshot(page, 'engine-error-modal')

    await restartBtn.click()
    await page.waitForTimeout(500)

    await expect(modal).toBeVisible()
    await expect(modal).toContainText('엔진 연결 실패')
  })

  test('(o) clicking 재시작 restores engine after 503 error', async ({ page }) => {
    let engineHealthy = false
    let genmoveCount = 0

    await page.unroute('/api/gtp/health')
    await page.unroute('/api/gtp/command')
    await page.unroute('/api/gtp/analyze')

    await page.route('/api/gtp/health', async (route) => {
      if (engineHealthy) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', version: '1.16.4' }),
        })
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '엔진 연결 실패' }),
        })
      }
    })
    await page.route('/api/gtp/command', async (route) => {
      if (engineHealthy) {
        const request = route.request()
        const postData = request.postDataJSON()
        if (postData?.command === 'genmove') {
          genmoveCount += 1
          const moves = ['D5', 'E6']
          const move = moves[genmoveCount - 1] ?? 'D5'
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: move }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: '' }),
        })
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '엔진 연결 실패' }),
        })
      }
    })
    await page.route('/api/gtp/analyze', async (route) => {
      if (engineHealthy) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            winrate: 0.5,
            scoreLead: 0,
            bestMoves: [{ move: 'D5', visits: 100, winrate: 0.5, scoreLead: 0 }],
            completed: true,
          }),
        })
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '엔진 연결 실패' }),
        })
      }
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')

    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(500)

    const modal = page.locator('role=dialog')
    await expect(modal).toBeVisible()

    engineHealthy = true

    const restartBtn = modal.locator('button:has-text("재시작")')
    await restartBtn.click()
    await page.waitForTimeout(800)

    await expect(modal).toHaveCount(0)

    const toast = page.locator('role=alert')
    await expect(toast).toContainText('재시작되었습니다')

    await page.locator('#mode-ai').click()
    await page.waitForTimeout(200)

    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(800)

    await clickVertex(page, 5, 5, 19)
    await page.waitForTimeout(800)

    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(4)

    await screenshot(page, 'engine-restart-restores')

    await page.screenshot({
      path: '.omo/evidence/task-15-katago-ai-integration.png',
      fullPage: true,
    })
  })
})
