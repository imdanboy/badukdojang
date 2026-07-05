import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://localhost:5173')
  await page.waitForSelector('#app-root', { timeout: 5000 })
  await page.waitForTimeout(1000)

  // --- Screenshot 1: Initial state with all controls visible ---
  await page.screenshot({ path: '.omo/evidence/task-6-baduk-mvp-controls.png' })

  // --- Verify Undo is disabled at root ---
  const undoDisabledAtRoot = await page.locator('button:has-text("Undo")').isDisabled()
  const fs = await import('fs')
  fs.writeFileSync('.omo/evidence/task-6-baduk-mvp-undo-disabled.txt',
    `Undo button disabled at root: ${undoDisabledAtRoot}\n`)

  // --- Play 3 moves ---
  const board = await page.$('.shudan-goban')
  if (board) {
    const box = await board.boundingBox()
    if (box) {
      const cellSize = box.width / 19
      // Move 1: Black at center
      await page.mouse.click(box.x + cellSize * 9.5, box.y + cellSize * 9.5)
      await page.waitForTimeout(300)
      // Move 2: White nearby
      await page.mouse.click(box.x + cellSize * 10.5, box.y + cellSize * 9.5)
      await page.waitForTimeout(300)
      // Move 3: Black another spot
      await page.mouse.click(box.x + cellSize * 9.5, box.y + cellSize * 10.5)
      await page.waitForTimeout(300)
    }
  }

  // Verify move counter shows "Move 3"
  const moveText3 = await page.locator('text=Move 3').textContent()
  console.log('After 3 moves, counter shows:', moveText3)

  // --- Click Undo, verify "Move 2" ---
  await page.click('button:has-text("Undo")')
  await page.waitForTimeout(300)
  const moveText2 = await page.locator('text=Move 2').textContent()
  console.log('After undo, counter shows:', moveText2)
  await page.screenshot({ path: '.omo/evidence/task-6-baduk-mvp-undo-redo.png' })

  // --- Click Redo, verify "Move 3" again ---
  await page.click('button:has-text("Redo")')
  await page.waitForTimeout(300)
  const moveText3Again = await page.locator('text=Move 3').textContent()
  console.log('After redo, counter shows:', moveText3Again)

  // --- Click New Game, verify empty board ---
  await page.click('button:has-text("New Game")')
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.omo/evidence/task-6-baduk-mvp-newgame.png' })
  const moveText0 = await page.locator('text=Move 0').textContent()
  console.log('After new game, counter shows:', moveText0)

  // --- Toggle Coordinates off ---
  await page.click('input[type="checkbox"]')
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.omo/evidence/task-6-baduk-mvp-no-coords.png' })

  // --- Toggle Coordinates back on ---
  await page.click('input[type="checkbox"]')
  await page.waitForTimeout(300)

  // --- Verify all 10 control elements exist ---
  const controls = {
    newGameBtn: await page.locator('button:has-text("New Game")').count(),
    passBtn: await page.locator('button:has-text("Pass")').count(),
    undoBtn: await page.locator('button:has-text("Undo")').count(),
    redoBtn: await page.locator('button:has-text("Redo")').count(),
    saveSgfBtn: await page.locator('button:has-text("Save SGF")').count(),
    loadSgfBtn: await page.locator('button:has-text("Load SGF")').count(),
    coordsToggle: await page.locator('input[type="checkbox"]').count(),
    boardSizeSelect: await page.locator('#board-size-select').count(),
    moveCounter: await page.locator('text=Move 0').count(),
    turnIndicator: await page.locator('text=To Play:').count(),
  }
  console.log('Control element counts:', JSON.stringify(controls, null, 2))

  await browser.close()
  console.log('All screenshots saved to .omo/evidence/task-6-baduk-mvp-*.png')
}

main().catch(console.error)