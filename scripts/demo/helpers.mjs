// Helpers for recording the product walkthrough with Playwright.
// They add a visible cursor and click ripples; neither is part of the app.

export const CURSOR = `
(() => {
  if (window.__demoOverlay) return;
  window.__demoOverlay = true;
  const style = document.createElement('style');
  style.textContent = \`
    #demo-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; pointer-events: none;
      transform: translate(-3px, -2px); transition: transform 60ms linear; }
    #demo-cursor.down svg { transform: scale(0.88); }
    #demo-ripple { position: fixed; z-index: 2147483645; width: 28px; height: 28px; margin: -14px 0 0 -14px;
      border: 2px solid #25fff9; border-radius: 9999px; pointer-events: none; opacity: 0; }
    #demo-ripple.go { animation: demo-ripple 450ms ease-out; }
    @keyframes demo-ripple { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.6); } }
  \`;
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.7 L11.6 14 L18 14 Z" fill="#141518" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const pos = JSON.parse(sessionStorage.getItem('demo-cursor') || '{"x":720,"y":450}');
  cursor.style.left = pos.x + 'px';
  cursor.style.top = pos.y + 'px';
  const ripple = document.createElement('div');
  ripple.id = 'demo-ripple';
  const mount = () => {
    document.head.appendChild(style);
    document.body.appendChild(cursor); document.body.appendChild(ripple);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    sessionStorage.setItem('demo-cursor', JSON.stringify({ x: e.clientX, y: e.clientY }));
  }, true);
  document.addEventListener('mousedown', (e) => {
    cursor.classList.add('down');
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    ripple.classList.remove('go'); void ripple.offsetWidth; ripple.classList.add('go');
  }, true);
  document.addEventListener('mouseup', () => cursor.classList.remove('down'), true);
})();
`;

export function makeDemo(page) {
  const sleep = (ms) => page.waitForTimeout(ms);
  let mouse = { x: 720, y: 450 };

  async function moveTo(x, y, steps) {
    const dist = Math.hypot(x - mouse.x, y - mouse.y);
    const n = steps ?? Math.max(8, Math.min(40, Math.round(dist / 22)));
    await page.mouse.move(x, y, { steps: n });
    mouse = { x, y };
  }

  async function hover(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error("element not visible");
    await moveTo(box.x + box.width / 2, box.y + Math.min(box.height / 2, 18));
  }

  async function click(locator, { pause = 450 } = {}) {
    await hover(locator);
    await sleep(180);
    await page.mouse.down();
    await sleep(70);
    await page.mouse.up();
    await sleep(pause);
  }

  async function type(locator, text, { delay = 38 } = {}) {
    await click(locator, { pause: 150 });
    await locator.pressSequentially(text, { delay });
  }

  /** Smoothly scroll the window or a scroll container (CSS selector). `by: "top"` scrolls back to the start. */
  async function scroll(by, { container = null, duration = 1200 } = {}) {
    await page.evaluate(
      async ([by, sel, ms]) => {
        const el = sel ? document.querySelector(sel) : null;
        const start = el ? el.scrollTop : window.scrollY;
        const max = el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
        const amount = by === "top" ? -start : Math.max(-start, Math.min(max - start, by));
        const t0 = performance.now();
        await new Promise((resolve) => {
          const step = (t) => {
            const p = Math.min(1, (t - t0) / ms);
            const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            const y = start + amount * ease;
            if (el) el.scrollTop = y;
            else window.scrollTo(0, y);
            if (p < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },
      [by, container, duration],
    );
    await sleep(150);
  }

  /** Smoothly scroll a container so that `locator` sits `offset` pixels below its top edge. */
  async function scrollTo(container, locator, { offset = 90, duration = 1400 } = {}) {
    await locator.waitFor();
    await locator.evaluate(
      async (el, [sel, offset, ms]) => {
        // A null container scrolls the page.
        const box = sel ? document.querySelector(sel) : null;
        const start = box ? box.scrollTop : window.scrollY;
        const max = box ? box.scrollHeight - box.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
        const goal = start + el.getBoundingClientRect().top - (box ? box.getBoundingClientRect().top : 0) - offset;
        const target = Math.max(0, Math.min(max, goal));
        const t0 = performance.now();
        await new Promise((resolve) => {
          const step = (t) => {
            const p = Math.min(1, (t - t0) / ms);
            const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            const y = start + (target - start) * ease;
            if (box) box.scrollTop = y;
            else window.scrollTo(0, y);
            if (p < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },
      [container, offset, duration],
    );
    await sleep(150);
  }

  return { sleep, moveTo, hover, click, type, scroll, scrollTo, get mouse() { return mouse; } };
}
