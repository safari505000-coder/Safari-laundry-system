export type PosReceiptLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PosReceiptPayload = {
  title: string;
  customerName: string;
  customerPhone: string;
  driverName: string;
  lines: PosReceiptLine[];
  total: number;
  /** BCP-47 or locale string */
  locale: string;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Opens an 80mm-oriented print preview and triggers the browser print dialog.
 * Suitable for thermal drivers configured to 80mm paper width.
 */
export function printPosReceipt(payload: PosReceiptPayload): void {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;

  const totalStr = payload.total.toLocaleString(payload.locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  const rows = payload.lines
    .map(
      (l) => `
    <tr>
      <td colspan="2" class="lbl">${escapeHtml(l.label)}</td>
    </tr>
    <tr>
      <td>${l.quantity} × ${l.unitPrice.toFixed(3)}</td>
      <td class="end">${l.lineTotal.toFixed(3)}</td>
    </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title)}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, "Segoe UI", Tahoma, Arial, sans-serif;
      width: 72mm;
      margin: 0 auto;
      padding: 4px;
      font-size: 11px;
      line-height: 1.35;
      color: #111;
    }
    h1 { font-size: 13px; margin: 0 0 6px; text-align: center; }
    .meta { margin-bottom: 8px; font-size: 10px; }
    .meta div { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    td { padding: 2px 0; vertical-align: top; }
    td.lbl { font-weight: 600; padding-top: 6px; }
    td.end { text-align: left; direction: ltr; unicode-bidi: embed; }
    .total {
      border-top: 1px dashed #000;
      margin-top: 8px;
      padding-top: 6px;
      font-weight: 700;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { width: 72mm; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.title)}</h1>
  <div class="meta">
    <div><strong>العميل:</strong> ${escapeHtml(payload.customerName)}</div>
    <div><strong>الجوال:</strong> ${escapeHtml(payload.customerPhone)}</div>
    <div><strong>السائق:</strong> ${escapeHtml(payload.driverName)}</div>
    <div><strong>التاريخ:</strong> ${escapeHtml(new Date().toLocaleString(payload.locale))}</div>
  </div>
  <table>${rows}</table>
  <div class="total">
    <span>الإجمالي</span>
    <span dir="ltr">${totalStr} KWD</span>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
