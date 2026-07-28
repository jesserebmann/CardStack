/* Camera barcode scanner wrapper around html5-qrcode.
   Works on Android Chrome and iOS Safari 14.5+ (requires HTTPS or localhost). */
window.Cardstack = window.Cardstack || {};

Cardstack.scanner = (function () {
  let instance = null;
  let running = false;

  const formats = () => {
    const F = Html5QrcodeSupportedFormats;
    return [
      F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8,
      F.UPC_A, F.UPC_E, F.ITF, F.CODABAR, F.CODE_93,
    ];
  };

  async function start(elementId, onResult, onError) {
    if (running) return;
    if (!window.Html5Qrcode) { onError && onError('Scanner library did not load.'); return; }
    instance = new Html5Qrcode(elementId, { formatsToSupport: formats(), verbose: false });
    const config = {
      fps: 10,
      qrbox: (vw, vh) => {
        const w = Math.min(Math.floor(vw * 0.78), 320);
        return { width: w, height: Math.floor(w * 0.56) };
      },
      aspectRatio: 1.0,
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
        () => {} /* per-frame failure: ignore */
      );
      running = true;
    } catch (err) {
      let msg = 'Could not open the camera.';
      if (String(err).match(/NotAllowedError|Permission/i)) msg = 'Camera access was blocked. Allow it in your browser settings and try again.';
      else if (String(err).match(/NotFoundError|no camera/i)) msg = 'No camera found on this device.';
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
