/**
 * Injected into every page in demo mode (E2E_DEMO=1): a visible cursor that glides to where
 * Playwright moves the mouse, a ripple on clicks, and a caption bar (see caption() in media.ts).
 * Screenshots taken with shot() hide all three.
 */
export const DEMO_OVERLAY = `
(() => {
  if (window.__e2eOverlay) return;
  window.__e2eOverlay = true;
  const css = \`
    nextjs-portal { display: none !important; }
    #e2e-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; pointer-events: none;
      margin: -2px 0 0 -3px; transition: left 220ms ease-out, top 220ms ease-out; }
    #e2e-cursor.down svg { transform: scale(0.88); }
    #e2e-ripple { position: fixed; z-index: 2147483646; width: 28px; height: 28px; margin: -14px 0 0 -14px;
      border: 2px solid #25fff9; border-radius: 9999px; pointer-events: none; opacity: 0; }
    #e2e-ripple.go { animation: e2e-ripple 450ms ease-out; }
    @keyframes e2e-ripple { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.6); } }
    #e2e-caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 28px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 12px; max-width: 980px; padding: 12px 18px; background: #141518;
      color: #f2f2f2; pointer-events: none; font: 400 16px/1.35 Georgia, serif; opacity: 0; transition: opacity 250ms ease; }
    #e2e-caption.show { opacity: 1; }
    #e2e-caption span { font: 400 10px/15px ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase;
      color: rgba(255,255,255,.6); border: 1px dashed rgba(255,255,255,.3); padding: 2px 6px; white-space: nowrap; }
  \`;
  const cursor = document.createElement('div');
  cursor.id = 'e2e-cursor';
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.7 L11.6 14 L18 14 Z" fill="#141518" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  let pos = { x: 720, y: 450 };
  try { pos = JSON.parse(sessionStorage.getItem('e2e-cursor') || '') || pos; } catch {}
  cursor.style.left = pos.x + 'px';
  cursor.style.top = pos.y + 'px';
  const ripple = document.createElement('div');
  ripple.id = 'e2e-ripple';
  const caption = document.createElement('div');
  caption.id = 'e2e-caption';
  const mount = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    document.body.append(cursor, ripple, caption);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    try { sessionStorage.setItem('e2e-cursor', JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {}
  }, true);
  document.addEventListener('mousedown', (e) => {
    cursor.classList.add('down');
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    ripple.classList.remove('go'); void ripple.offsetWidth; ripple.classList.add('go');
  }, true);
  document.addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  window.__e2eCaption = (text, label) => {
    if (!text) { caption.classList.remove('show'); return; }
    caption.textContent = '';
    if (label) { const s = document.createElement('span'); s.textContent = label; caption.appendChild(s); }
    caption.appendChild(document.createTextNode(text));
    caption.classList.add('show');
  };
})();
`;
