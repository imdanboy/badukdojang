import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://localhost:5173')
  await page.waitForSelector('#app-root', { timeout: 5000 })
  // Wait for board to render
  await page.waitForTimeout(1000)
  
  // Click on a few intersections to place stones
  const board = await page.$('.shudan-goban')
  if (board) {
    const box = await board.boundingBox()
    if (box) {
      const cellSize = box.width / 19
      // Click center
      await page.mouse.click(box.x + cellSize * 9.5, box.y + cellSize * 9.5)
      await page.waitForTimeout(300)
      // Click nearby (white's turn)
      await page.mouse.click(box.x + cellSize * 10.5, box.y + cellSize * 9.5)
      await page.waitForTimeout(300)
      // Click on occupied (should flash red)
      await page.mouse.click(box.x + cellSize * 9.5, box.y + cellSize * 9.5)
      await page.waitForTimeout(300)
    }
  }
  
  await page.screenshot({ path: '.omo/evidence/task-3-baduk-mvp.png' })
  await browser.close()
  console.log('Screenshot saved to .omo/evidence/task-3-baduk-mvp.png')
}

main().catch(console.error)
