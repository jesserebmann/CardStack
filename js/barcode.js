/* Renders a barcode or QR code into a container element.
   Uses JsBarcode for 1D formats and qrcode-generator for QR. */
window.Cardstack = window.Cardstack || {};

Cardstack.barcode = (function () {
  const ONE_D = new Set(['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF']);

  // Map html5-qrcode format names to our internal format keys.
  function mapScanFormat(name) {
    switch (name) {
      case 'QR_CODE': return 'QR';
      case 'CODE_128': return 'CODE128';
      case 'CODE_39': return 'CODE39';
      case 'EAN_13': return 'EAN13';
      case 'EAN_8': return 'EAN8';
      case 'UPC_A':
      case 'UPC_E': return 'UPC';
      case 'ITF': return 'ITF';
      default: return 'CODE128';
    }
  }

  // Render into `holder`. Returns {ok, format} where format may have changed
  // if the requested one was invalid and we fell back to CODE128.
  function render(holder, value, format, opts) {
    opts = opts || {};
    holder.innerHTML = '';
    if (!value) return { ok: false, format };

    if (format === 'QR') {
      try {
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        const cells = opts.small ? 3 : 6;
        holder.innerHTML = qr.createSvgTag({ cellSize: cells, margin: 1, scalable: true });
        const svg = holder.querySelector('svg');
        if (svg) { svg.style.width = opts.small ? '64px' : '220px'; svg.style.height = 'auto'; }
        return { ok: true, format };
      } catch (e) {
        return { ok: false, format };
      }
    }

    // 1D formats via JsBarcode. Try requested, fall back to CODE128.
    const attempt = (fmt) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, value, {
        format: fmt,
        displayValue: false,
        margin: 0,
        height: opts.small ? 26 : 90,
        width: opts.small ? 1 : 2.4,
        background: 'transparent',
        lineColor: opts.small ? (opts.lineColor || '#000') : '#111',
      });
      return svg;
    };

    try {
      holder.appendChild(attempt(format));
      return { ok: true, format };
    } catch (e) {
      try {
        holder.innerHTML = '';
        holder.appendChild(attempt('CODE128'));
        return { ok: true, format: 'CODE128', fellBack: true };
      } catch (e2) {
        return { ok: false, format };
      }
    }
  }

  return { render, mapScanFormat, ONE_D };
})();
