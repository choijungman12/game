/* ==========================================================================
   QR 코드 — 전역 qrcode(qrcode-generator) 래퍼. SVG로 렌더.
   라이브러리 로드가 늦어도 안전하게 대기.
   ========================================================================== */
function waitForLib(timeout = 4000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function check() {
      if (typeof window.qrcode === "function") return resolve(true);
      if (Date.now() - t0 > timeout) return resolve(false);
      setTimeout(check, 60);
    })();
  });
}

export async function makeQR(container, text, opts = {}) {
  if (!container) return;
  const ok = await waitForLib();
  if (!ok) {
    container.innerHTML =
      `<div style="display:grid;place-items:center;text-align:center;color:#333;font-weight:800;padding:10px;font-size:12px">QR 라이브러리를<br>불러오지 못했습니다.<br><a href="${text}" style="color:#2563eb;word-break:break-all">${text}</a></div>`;
    return;
  }
  try {
    const qr = window.qrcode(0, opts.ec || "M");
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: opts.cellSize || 6, margin: opts.margin || 1, scalable: true });
    const svg = container.querySelector("svg");
    if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; }
  } catch (e) {
    container.textContent = text;
  }
}
