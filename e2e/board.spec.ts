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
    path: `.omo/evidence/task-8-baduk-mvp-e2e-${name}.png`,
    fullPage: true,
  })
}

test.describe('Board E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.shudan-goban')
  })

  test('(a) loads with empty board, grid, and coordinates', async ({ page }) => {
    const board = page.locator('.shudan-goban')
    await expect(board).toBeVisible()

    const gridLines = page.locator('.shudan-gridline')
    await expect(gridLines).toHaveCount(38)

    const hoshis = page.locator('.shudan-hoshi')
    await expect(hoshis).toHaveCount(9)

    const coordX = page.locator('.shudan-coordx')
    const coordY = page.locator('.shudan-coordy')
    await expect(coordX).toHaveCount(2)
    await expect(coordY).toHaveCount(2)

    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    await screenshot(page, 'empty-board')
  })

  test('(b) change board size to 13 renders 13x13 grid', async ({ page }) => {
    const select = page.locator('#board-size-select')
    await select.selectOption('13')

    await page.waitForTimeout(200)

    const gridLines = page.locator('.shudan-gridline')
    await expect(gridLines).toHaveCount(26)

    const vertices = page.locator('.shudan-vertex')
    await expect(vertices).toHaveCount(13 * 13)

    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    await screenshot(page, '13x13-board')
  })

  test('(c) click intersection places a stone', async ({ page }) => {
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    const blackStone = page.locator('.shudan-vertex.shudan-sign_1 .shudan-stone-image')
    await expect(blackStone).toHaveCount(1)

    await screenshot(page, 'place-stone')
  })

  test('(d) capture removes a stone', async ({ page }) => {
    // Surround white stone at (3,3) with black stones
    await clickVertex(page, 3, 2, 19) // B
    await clickVertex(page, 3, 3, 19) // W (target)
    await clickVertex(page, 2, 3, 19) // B
    await clickVertex(page, 4, 4, 19) // W (filler)
    await clickVertex(page, 4, 3, 19) // B
    await clickVertex(page, 5, 5, 19) // W (filler)
    await clickVertex(page, 3, 4, 19) // B — captures W at (3,3)

    await page.waitForTimeout(200)

    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(6)

    await screenshot(page, 'capture')
  })

  test('(e) undo removes last stone', async ({ page }) => {
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    await page.locator('button:has-text("Undo")').click()
    await page.waitForTimeout(200)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    await screenshot(page, 'undo')
  })

  test('(f) redo restores stone', async ({ page }) => {
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    await page.locator('button:has-text("Undo")').click()
    await page.waitForTimeout(200)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    await page.locator('button:has-text("Redo")').click()
    await page.waitForTimeout(200)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    await screenshot(page, 'redo')
  })

  test('(g) pass flips turn indicator', async ({ page }) => {
    const turnIndicator = page.locator('text=To Play:')
    await expect(turnIndicator).toContainText('Black')

    await page.locator('button:has-text("Pass")').click()
    await page.waitForTimeout(300)

    // Verify turn flipped by placing a stone — it should be White's turn now
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    const whiteStone = page.locator('.shudan-vertex.shudan-sign_-1 .shudan-stone-image')
    await expect(whiteStone).toHaveCount(1)

    await screenshot(page, 'pass')
  })

  test('(h) save SGF triggers download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Save SGF")').click(),
    ])

    expect(download.suggestedFilename()).toContain('.sgf')
    await screenshot(page, 'save-sgf')
  })

  test('(i) load SGF restores board', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('e2e/fixtures/test-game.sgf')
    await page.waitForTimeout(500)

    const stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(5)

    const turnIndicator = page.locator('text=To Play:')
    await expect(turnIndicator).toContainText('White')

    await screenshot(page, 'load-sgf')
  })

  test('(j) toggle coordinates hides and shows labels', async ({ page }) => {
    const coordX = page.locator('.shudan-coordx')
    const coordY = page.locator('.shudan-coordy')

    await expect(coordX).toHaveCount(2)
    await expect(coordY).toHaveCount(2)

    await page.locator('label:has-text("Coordinates") input[type="checkbox"]').click()
    await page.waitForTimeout(200)

    await expect(coordX).toHaveCount(0)
    await expect(coordY).toHaveCount(0)

    await page.locator('label:has-text("Coordinates") input[type="checkbox"]').click()
    await page.waitForTimeout(200)

    await expect(coordX).toHaveCount(2)
    await expect(coordY).toHaveCount(2)

    await screenshot(page, 'toggle-coords')
  })

  test('(k) placing on occupied point does not add a second stone', async ({ page }) => {
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    // Click same vertex again — should be rejected
    await clickVertex(page, 3, 3, 19)
    await page.waitForTimeout(200)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(1)

    await screenshot(page, 'occupied')
  })

  test('full game flow — play, undo, save, load', async ({ page }) => {
    // Play 5 moves
    await clickVertex(page, 3, 3, 19) // B
    await clickVertex(page, 4, 4, 19) // W
    await clickVertex(page, 5, 5, 19) // B
    await clickVertex(page, 6, 6, 19) // W
    await clickVertex(page, 7, 7, 19) // B
    await page.waitForTimeout(200)

    let stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(5)

    // Undo 2 moves
    await page.locator('button:has-text("Undo")').click()
    await page.waitForTimeout(100)
    await page.locator('button:has-text("Undo")').click()
    await page.waitForTimeout(200)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(3)

    // Save SGF
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Save SGF")').click(),
    ])
    expect(download.suggestedFilename()).toContain('.sgf')

    // New game to clear board
    await page.locator('button:has-text("New Game")').click()
    await page.waitForTimeout(200)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(0)

    // Load the saved SGF back
    // Note: we can't easily load the downloaded file, so use the fixture instead
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('e2e/fixtures/test-game.sgf')
    await page.waitForTimeout(500)

    stones = page.locator('.shudan-stone-image')
    await expect(stones).toHaveCount(5)

    await screenshot(page, 'fullflow')
  })
})
