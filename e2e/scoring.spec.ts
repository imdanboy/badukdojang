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
    path: `.omo/evidence/task-13-katago-ai-integration-${name}.png`,
    fullPage: true,
  })
}

test.describe('Scoring E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept all engine requests so tests work without a running bridge.
    await page.route('/api/gtp/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', humanModelAvailable: true }),
      })
    })

    await page.route('/api/gtp/command', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      if (postData?.command === 'final_score') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'B+3.5' }),
        })
        return
      }

      if (postData?.command === 'final_status_list') {
        const category = postData.args?.[0]
        if (category === 'dead') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: 'D4' }),
          })
          return
        }
        if (category === 'alive') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: 'Q16' }),
          })
          return
        }
        if (category === 'white_territory') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: 'A1\nB1' }),
          })
          return
        }
        if (category === 'black_territory') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: 'T19' }),
          })
          return
        }
      }

      // Return empty success for all other commands (clear_board, boardsize, play, etc.)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
  })

  test('(a) double pass enables 계가 button, click shows modal with result', async ({
    page,
  }) => {
    // Play a few moves so the board isn't empty
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)
    await clickVertex(page, 15, 15, 19)
    await page.waitForTimeout(200)

    // Both players pass
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)

    // 계가 button should be enabled
    const scoreBtn = page.locator('#score-btn')
    await expect(scoreBtn).toBeEnabled()

    // Click 계가
    await scoreBtn.click()

    await expect(page.locator('text=계가 결과')).toBeVisible()
    await expect(page.locator('text=백 7.5집 승')).toBeVisible()
    await expect(page.locator('text=덤 (komi)')).toBeVisible()

    await screenshot(page, 'modal-result')

    // Click 확인 to close modal
    await page.locator('button:has-text("확인")').click()
    await page.waitForTimeout(200)

    // Modal should be gone
    await expect(page.locator('text=계가 결과')).toHaveCount(0)
  })

  test('(b) manual override: click a stone to toggle dead/alive', async ({ page }) => {
    // Play a move
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    // Both players pass
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)

    await page.locator('#score-btn').click()
    await expect(page.locator('text=계가 결과')).toBeVisible({ timeout: 10000 })

    const deadStone = page.locator('.shudan-vertex.shudan-marker_cross[data-x="3"][data-y="3"]')
    await expect(deadStone).toHaveCount(1)

    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(300)

    await expect(deadStone).toHaveCount(0)

    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(300)

    await expect(deadStone).toHaveCount(1)

    await screenshot(page, 'manual-override')

    // Close modal
    await page.locator('button:has-text("확인")').click()
  })

  test('(c) scoring does NOT auto-trigger on double pass', async ({ page }) => {
    // Play a move
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    // Both players pass
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(500)

    // Modal should NOT appear automatically
    await expect(page.locator('text=계가 결과')).toHaveCount(0)

    // 계가 button should be enabled but not clicked
    const scoreBtn = page.locator('#score-btn')
    await expect(scoreBtn).toBeEnabled()

    await screenshot(page, 'no-auto-trigger')
  })

  test('evidence: scoring modal with dead stones and manual override', async ({ page }) => {
    // Play moves
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)
    await clickVertex(page, 15, 15, 19)
    await page.waitForTimeout(200)

    // Both players pass
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)
    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(200)

    // Click 계가
    await page.locator('#score-btn').click()
    await page.waitForTimeout(500)

    // Take screenshot of modal with dead stone markers
    await page.screenshot({
      path: '.omo/evidence/task-13-katago-ai-integration.png',
      fullPage: true,
    })

    // Close modal
    await page.locator('button:has-text("확인")').click()
  })
})
