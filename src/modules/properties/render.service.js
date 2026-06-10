import { existsSync } from 'fs';
import { env } from '../../config/env.js';

// Self-hosted headless Chromium renderer with stealth. Renders the page like a
// real browser (executes JS, loads the gallery), evades basic bot detection, and
// extracts the real photo gallery from the live DOM (filtering out logos/icons
// by image size). Fully optional and resilient: returns nulls on any failure so
// the caller falls back to a plain fetch.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let _unavailable = false;
let _puppeteer = null; // memoized stealth-wrapped puppeteer

/** Report whether headless rendering is enabled and the Chromium binary exists. */
export function headlessStatus() {
  return {
    enabled: env.useHeadless,
    path: env.chromiumPath,
    binaryExists: env.chromiumPath ? existsSync(env.chromiumPath) : false,
    markedUnavailable: _unavailable,
  };
}

async function getPuppeteer() {
  if (_puppeteer) return _puppeteer;
  const { addExtra } = await import('puppeteer-extra');
  const core = (await import('puppeteer-core')).default;
  const Stealth = (await import('puppeteer-extra-plugin-stealth')).default;
  const pp = addExtra(core);
  pp.use(Stealth());
  _puppeteer = pp;
  return pp;
}

/**
 * Render a URL and pull the real gallery images out of the DOM.
 * Returns { html, images } (images may be []), or { html: null, images: [] }.
 */
export async function renderPageHtml(url) {
  if (!env.useHeadless || _unavailable) return { html: null, images: [] };
  if (env.chromiumPath && !existsSync(env.chromiumPath)) {
    _unavailable = true;
    console.warn('headless: Chromium not found at', env.chromiumPath);
    return { html: null, images: [] };
  }

  let puppeteer;
  try {
    puppeteer = await getPuppeteer();
  } catch (err) {
    _unavailable = true;
    console.warn('headless: puppeteer unavailable:', err.message);
    return { html: null, images: [] };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: env.chromiumPath,
      headless: 'new',
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--no-zygote', '--lang=es-ES,es',
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' });
    await page.setViewport({ width: 1366, height: 900 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 50_000 });

    // Trigger lazy galleries: scroll through the page a few times.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const step = () => {
          window.scrollTo(0, y);
          y += Math.max(400, window.innerHeight);
          if (y < document.body.scrollHeight + 2000) setTimeout(step, 250);
          else { window.scrollTo(0, 0); setTimeout(resolve, 400); }
        };
        step();
      });
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1_500));

    // Extract gallery images straight from the live DOM, filtering decoration.
    const images = await page.evaluate(() => {
      const out = new Set();
      const BAD = /(logo|sprite|icon|favicon|placeholder|avatar|flag|badge|banner|pixel|loading|spinner|whatsapp|facebook|instagram|googlelogo)/i;
      const looksImg = (u) => typeof u === 'string' && /^https?:\/\//.test(u) &&
        /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u) && !BAD.test(u) && !u.startsWith('data:');

      for (const img of document.querySelectorAll('img')) {
        const cands = [img.currentSrc, img.src, img.dataset.src, img.dataset.lazy,
          img.dataset.original, img.getAttribute('data-full-src')];
        if (img.srcset) for (const s of img.srcset.split(',')) cands.push(s.trim().split(/\s+/)[0]);
        const big = (img.naturalWidth || img.width || 0) >= 350 || (img.naturalHeight || img.height || 0) >= 250;
        for (const u of cands) {
          if (!looksImg(u)) continue;
          // Keep loaded images that are reasonably large, or any data-src candidate.
          if (big || u === img.dataset.src || u === img.dataset.lazy || u === img.dataset.original) out.add(u);
        }
      }
      // CSS background images (some carousels use them)
      for (const el of document.querySelectorAll('[style*="background-image"]')) {
        const m = (el.style.backgroundImage || '').match(/url\(["']?(https?:[^"')]+)/);
        if (m && looksImg(m[1])) out.add(m[1]);
      }
      return [...out].slice(0, 30);
    }).catch(() => []);

    const html = await page.content();
    return { html, images };
  } catch (err) {
    console.warn('headless render failed:', err.message);
    return { html: null, images: [] };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
