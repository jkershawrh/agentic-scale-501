import { expect, test } from '@playwright/test'

test('opening and architecture remain visually stable', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('opening.png', { fullPage: true })
  await page.goto('/?act=1&scene=0')
  await expect(page).toHaveScreenshot('architecture.png', { fullPage: true })
})

test('live journey opens as a workload workspace with topology on demand', async ({ page }) => {
  await page.goto('/?act=2&scene=0')
  await expect(page).toHaveScreenshot('live-journey.png', { fullPage: true })
})

test('core controls are keyboard reachable', async ({ page }) => {
  await page.goto('/?act=0&scene=0')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Restart presentation' })).toBeFocused()
})

test('stage and laptop scenes require no scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'rehearsal-mobile', 'Mobile is a rehearsal control surface, not a no-scroll stage.')
  const scenes = ['/?act=0&scene=0', '/?act=0&scene=1', '/?act=1&scene=0', '/?act=2&scene=0', '/?act=2&scene=1', '/?act=3&scene=0', '/?act=4&scene=0']
  for (const scene of scenes) {
    await page.goto(scene)
    await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px')
    const overflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - window.innerWidth,
      vertical: document.documentElement.scrollHeight - window.innerHeight,
    }))
    expect(overflow, `Unexpected scroll at ${scene}`).toEqual({ horizontal: 0, vertical: 0 })
  }
})
