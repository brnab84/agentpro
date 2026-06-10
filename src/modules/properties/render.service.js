import { existsSync } from 'fs';
import { env } from '../../config/env.js';

// Self-hosted headless Chromium renderer. Renders the page like a real browser
// (executes JS, loads the photo gallery) and returns the final HTML. Fully
// optional and resilient: if Chromium isn't available or anything fails, it
// returns null and the caller falls back to a plain fetch.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let _unavailable = false; // remember if Chromium can't launch, to skip future tries

/** Render a URL with headless Chromium; returns HTML string or null. */
export async function renderPageHtml(url) {
  if (!env.useHeadless || _unavailable) return null;
  if (env.chromiumPath && !existsSync(env.chromiumPath)) {
    _unavailable = true;
    console.warn('headless: Chromium not found at', env.chromiumPath);
    return null;
  }

  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    _unavailable = true;
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: env.chromiumPath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 900 });
    // Don't waste time/memory on media/fonts we don't need.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'media' || type === 'font') req.abort();
      else req.continue();
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });
    // Give lazy galleries a moment + nudge lazy-loaders by scrolling.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await new Promise((r) => setTimeout(r, 1_500));

    return await page.content();
  } catch (err) {
    console.warn('headless render failed:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
