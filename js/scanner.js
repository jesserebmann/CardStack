/* Camera barcode/QR scanner wrapper around html5-qrcode.
   Works on Android Chrome and iOS Safari 14.5+ (requires HTTPS or localhost). */
window.Cardstack = window.Cardstack || {};

Cardstack.scanner = (function () {
  let instance = null;
  let running = false;
  let readerEl = null;
  let tapHandler = null;

  const formats = () => {
    const F = Html5QrcodeSupportedFormats;
    return [
      F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8,
      F.UPC_A, F.UPC_E, F.CODE_39, F.ITF,
    ];
  };

  // Best-effort focus tweaks applied to the ALREADY-RUNNING camera. Wrapped so
  // that unsupported constraints (common on iOS) can never break the scanner.
  async function tryContinuousFocus() {
    try {
      if (instance && instance.applyVideoConstraints) {
        await instance.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (e) { /* not supported — ignore */ }
  }
  async function focusAt(x, y) {
    try {
      if (instance && instance.applyVideoConstraints) {
        await instance.applyVideoConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }] });
      }
    } catch (e) {
      await tryContinuousFocus();
    }
  }

  async function start(elementId, onResult, onError) {
    if (running) return;
    if (!window.Html5Qrcode) { onError && onError('Scanner library did not load.'); return; }
    instance = new Html5Qrcode(elementId, { formatsToSupport: formats(), verbose: false });

    const config = {
      fps: 15,
      qrbox: (vw, vh) => {
        const w = Math.min(Math.floor(Math.min(vw, vh) * 0.82), 300);
        return { width: w, height: Math.round(w * 0.66) };
      },
    };

    try {
      await instance.start(
        { facingMode: 'environment' },
        config,
        (decodedText, decodedResult) => {
          const name = decodedResult && decodedResult.result &&
            decodedResult.result.format && decodedResult.result.format.formatName;
          onResult(decodedText, Cardstack.barcode.mapScanFormat(name));
        },
        () => {} /* per-frame decode miss: ignore */
      );
      running = true;

      // Turn on continuous autofocus (best effort).
      tryContinuousFocus();

      // Tap-to-focus: tap anywhere on the camera view to refocus there.
      readerEl = document.getElementById(elementId);
      if (readerEl) {
        tapHandler = (ev) => {
          const rect = readerEl.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const cx = ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX;
          const cy = ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY;
          const x = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (cy - rect.top) / rect.height));
          focusAt(x, y);
        };
        readerEl.addEventListener('click', tapHandler);
      }
    } catch (err) {
      let msg = 'Could not open the camera.';
      const s = String(err);
      if (s.match(/NotAllowedError|Permission/i)) msg = 'Camera access was blocked. Allow it in your browser settings and try again.';
      else if (s.match(/NotFoundError|no camera/i)) msg = 'No camera found on this device.';
      else if (location.protocol !== 'https:' && location.hostname !== 'localhost') msg = 'The camera needs a secure (https) connection.';
      onError && onError(msg);
    }
  }

  async function stop() {
    if (readerEl && tapHandler) { try { readerEl.removeEventListener('click', tapHandler); } catch (e) {} }
    readerEl = null; tapHandler = null;
    if (!instance || !running) { running = false; return; }
    try { await instance.stop(); await instance.clear(); } catch (e) {}
    running = false;
    instance = null;
  }

  return { start, stop, isRunning: () => running };
})();
