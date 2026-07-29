/* Camera barcode/QR scanner wrapper around html5-qrcode.
   Works on Android Chrome and iOS Safari 14.5+ (requires HTTPS or localhost). */
window.Cardstack = window.Cardstack || {};

Cardstack.scanner = (function () {
  let instance = null;
  let running = false;

  const formats = () => {
    const F = Html5QrcodeSupportedFormats;
    return [
      F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8,
      F.UPC_A, F.UPC_E, F.CODE_39, F.ITF,
    ];
  };

  async function start(elementId, onResult, onError) {
    if (running) return;
    if (!window.Html5Qrcode) { onError && onError('Scanner library did not load.'); return; }
    instance = new Html5Qrcode(elementId, { formatsToSupport: formats(), verbose: false });

    const config = {
      fps: 15,
      // Square scan window: QR codes are square, so a square box detects them
      // far more easily than a wide/short rectangle. 1D barcodes fit too.
      qrbox: (vw, vh) => {
        const s = Math.min(Math.floor(Math.min(vw, vh) * 0.75), 300);
        return { width: s, height: s };
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
    if (!instance || !running) { running = false; return; }
    try { await instance.stop(); await instance.clear(); } catch (e) {}
    running = false;
    instance = null;
  }

  return { start, stop, isRunning: () => running };
})();
