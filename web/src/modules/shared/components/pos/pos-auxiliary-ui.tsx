import { Loader2, Minus, Plus } from 'lucide-react';
import { OrderDetailDialog } from '@/modules/shared/components/orders/order-detail-dialog';
import { OrderIdBarcode } from '@/modules/shared/components/orders/order-id-barcode';
import { TermsQr } from '@/components/common/terms-qr';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { cn } from '@/lib/utils';
import type { PosEngineApi } from '@/modules/shared/hooks/use-pos-engine';

export function PosAuxiliaryUi({ p }: { p: PosEngineApi }) {
  const {
    serviceOpen,
    setServiceOpen,
    rtl,
    serviceItem,
    serviceOptionsForItem,
    serviceQty,
    changeServiceQty,
    serviceNeshaLevel,
    setServiceNeshaLevel,
    serviceStyle,
    setServiceStyle,
    servicePackaging,
    setServicePackaging,
    serviceItemNote,
    setServiceItemNote,
    addServiceSelectionToCart,
    defaultVisual,
    receiptSheets,
    t,
    dateLocale,
    formatKwdParts,
    garmentTagCount,
    scanOrderDialogOpen,
    setScanOrderDialogOpen,
    scanOrderDetail,
    newOpen,
    setNewOpen,
    resetNewCustomerForm,
    newName,
    setNewName,
    newPhone,
    setNewPhone,
    newPhone2,
    setNewPhone2,
    newArea,
    setNewArea,
    newBlock,
    setNewBlock,
    newStreet,
    setNewStreet,
    newAvenue,
    setNewAvenue,
    newHouse,
    setNewHouse,
    savingCustomer,
    saveNewCustomer,
  } = p;
  const isRedZoneItem = serviceItem
    ? /GHUTRA|SHEMAGH/i.test(serviceItem.code) ||
      /غترة|شماغ/.test(serviceItem.nameAr || '')
    : false;

  return (
    <>
      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent
          className="max-w-3xl border-border bg-white p-0"
          dir={rtl ? 'rtl' : 'ltr'}
        >
          {serviceItem ?
            <div className="grid gap-0 md:grid-cols-[1.55fr_1fr]">
              <div className="space-y-4 p-5">
                <DialogHeader className="text-start">
                  <DialogTitle className="text-lg font-bold text-slate-900">
                    اختر نوع الخدمة - {serviceItem.nameAr}
                  </DialogTitle>
                </DialogHeader>
      
                <div className="space-y-2">
                  {serviceOptionsForItem(serviceItem).map((service) => (
                    <div
                      key={service.key}
                      className={cn(
                        'grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border p-3',
                        service.available ?
                          'border-slate-300 bg-white'
                        : 'border-zinc-200 bg-zinc-100 opacity-60',
                      )}
                    >
                      <div className="text-sm font-semibold text-zinc-800">
                        {service.labelAr}
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {service.available ? `${service.price.toFixed(3)} ${rtl ? 'د.ك' : 'KWD'}` : '---'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-slate-400"
                          disabled={!service.available || serviceQty[service.key] === 0}
                          onClick={() => changeServiceQty(service.key, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-7 text-center text-sm font-bold tabular-nums">
                          {serviceQty[service.key]}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          className="h-8 w-8 bg-slate-900 text-white hover:bg-slate-800"
                          disabled={!service.available}
                          onClick={() => changeServiceQty(service.key, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
      
                {isRedZoneItem ? <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">محددات الغترة/الشماغ</p>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-700">مستوى النشا</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={serviceNeshaLevel}
                      onChange={(e) =>
                        setServiceNeshaLevel(
                          e.target.value as '100%' | '50%' | '25%' | '0%',
                        )
                      }
                    >
                      <option value="0%">NESHA 0%</option>
                      <option value="25%">NESHA 25%</option>
                      <option value="50%">NESHA 50%</option>
                      <option value="100%">100%</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-700">الستايل</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={serviceStyle}
                      onChange={(e) =>
                        setServiceStyle(
                          e.target.value as
                            | 'SEEDA'
                            | 'MIRZAAM'
                            | 'MURABAA'
                            | '',
                        )
                      }
                    >
                      <option value="">-</option>
                      <option value="SEEDA">SEEDA</option>
                      <option value="MIRZAAM">MIRZAAM</option>
                      <option value="MURABAA">MURABAA</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-700">التغليف</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={servicePackaging}
                      onChange={(e) =>
                        setServicePackaging(
                          e.target.value as 'SHARSHAF' | 'TASFEET' | '',
                        )
                      }
                    >
                      <option value="">-</option>
                      <option value="SHARSHAF">SHARSHAF</option>
                      <option value="TASFEET">TASFEET</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-700">ملاحظات الصنف</Label>
                    <Input
                      value={serviceItemNote}
                      onChange={(e) => setServiceItemNote(e.target.value)}
                      placeholder="أدخل ملاحظة الصنف"
                      className="mt-1 bg-white"
                    />
                  </div>
                </div> : null}
      
                <DialogFooter>
                  <Button
                    type="button"
                    className="w-full bg-slate-900 text-white hover:bg-slate-800"
                    onClick={addServiceSelectionToCart}
                  >
                    إضافة إلى سلة الأصناف
                  </Button>
                </DialogFooter>
              </div>
      
              <div className="flex flex-col items-center justify-center gap-4 border-t border-zinc-100 bg-zinc-50 p-5 md:border-s md:border-t-0">
                {(() => {
                  const { Icon, tone } = defaultVisual(serviceItem.code);
                  return (
                    <>
                      <div
                        className={cn(
                          'flex h-28 w-28 items-center justify-center rounded-3xl',
                          tone,
                        )}
                      >
                        <Icon className="h-14 w-14" strokeWidth={1.4} />
                      </div>
                      <p className="text-center text-lg font-bold text-slate-900">
                        {serviceItem.nameAr}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
          : null}
        </DialogContent>
      </Dialog>
      
      <section
        id="pos-receipt-print"
        aria-hidden={receiptSheets?.length ? undefined : true}
        className="hidden"
      >
        {(receiptSheets ?? []).map((sheet, sheetIdx) => (
          <div
            key={`${sheet.orderId}-${sheetIdx}`}
            className="pos-receipt-wrap pos-receipt-sheet"
            dir="rtl"
          >
            <img src="/logo.png" alt="Safari Omni" className="pos-receipt-logo" />
            <h2>Safari Laundry</h2>
            <p className="pos-receipt-sub">Farwaniya, 00</p>
            <p className="pos-receipt-sub">
              Shop Tel: 24899399 - Call Center: 22200299
            </p>
            <div className="pos-receipt-meta-grid">
              <p><strong>INV#:</strong> {sheet.orderNumber ?? '-'}</p>
              <p>
                <strong>Employee:</strong>{' '}
                {`${sheet.employeeId} / ${sheet.employeeName}`}
              </p>
              <p>
                <strong>Date:</strong>{' '}
                {new Date(sheet.createdAt).toLocaleString(dateLocale)}
              </p>
            </div>
            {sheet.paymentPending ?
              <p
                className="my-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-center text-[10px] font-semibold text-amber-900"
                dir="auto"
              >
                {t('pos.checkout.paymentPendingReceipt')}
              </p>
            : null}
            <div className="pos-customer-box">
              <div className="pos-customer-row">
                <span><strong>Name:</strong> {sheet.customerName ?? '-'}</span>
                <span><strong>Mobile:</strong> {sheet.customerMobile ?? '-'}</span>
              </div>
              <div className="pos-customer-row">
                <span>
                  <strong>Balance:</strong>{' '}
                  {Number.parseFloat(sheet.customerBalance ?? '0')
                    .toFixed(3)}{' '}
                  {rtl ? 'د.ك' : 'KWD'}
                </span>
              </div>
              <div className="pos-customer-address">
                <strong>Address:</strong> {sheet.customerAddress ?? '-'}
              </div>
            </div>
            <table className="pos-receipt-table">
              <thead>
                <tr>
                  <th>الأصناف</th>
                  <th>Type</th>
                  <th className="text-end">K.D</th>
                  <th className="text-end">F</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((line, idx) => (
                  <tr key={`${line.label}-${idx}`}>
                    <td className="pos-receipt-desc">
                      <div>{line.label}</div>
                      <div className="pos-receipt-qty">{line.quantity} x</div>
                      {(line.neshaLevel !== '0%' || line.foldingStyle) ?
                        <div className="pos-receipt-specs">
                          <div><strong>المحددات:</strong></div>
                          <div>NESHA: {line.neshaLevel}</div>
                          {line.foldingStyle ? <div>Style: {line.foldingStyle}</div> : null}
                        </div>
                      : null}
                    </td>
                    <td>{sheet.serviceType ?? 'NORMAL'}</td>
                    <td className="text-end">{formatKwdParts(line.lineTotal).dinar}</td>
                    <td className="text-end">{formatKwdParts(line.lineTotal).fils}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pos-receipt-totals">
              <div>
                <span>{t('pos.subtotalLabel')}</span>
                <span>
                  {(sheet.lineItemsSubtotal ?? 0).toFixed(3)} {rtl ? 'د.ك' : 'KWD'}
                </span>
              </div>
              <div>
                <span>{t('pos.deliveryFeeLabel')}</span>
                <span>
                  {sheet.attachedInvoice ?
                    `0.000 ${rtl ? 'د.ك' : 'KWD'}`
                  : (sheet.freeDelivery || (sheet.deliveryFee ?? 0) <= 0) ?
                    t('pos.freeDelivery')
                  : `${(sheet.deliveryFee ?? 0).toFixed(3)} ${rtl ? 'د.ك' : 'KWD'}`}
                </span>
              </div>
              <div className="net">
                <span>{t('pos.grandTotalLabel')}</span>
                <span>{(sheet.total ?? 0).toFixed(3)} {rtl ? 'د.ك' : 'KWD'}</span>
              </div>
              {sheet.paymentLabel ?
                <div className="mt-1 text-[9px] text-muted-foreground">
                  <strong>الدفع / Payment:</strong> {sheet.paymentLabel}
                </div>
              : null}
            </div>
            <div className="pos-receipt-notes">
              <p><strong>ملاحظات:</strong></p>
              {sheet.lines
                .filter((l) => l.itemNote.trim().length > 0)
                .map((l, i) => (
                  <p key={`${l.label}-note-${i}`}>
                    - {l.label}: {l.itemNote}
                  </p>
                ))}
            </div>
            {sheet.orderId ?
              <div className="pos-receipt-barcode">
                <OrderIdBarcode
                  orderId={sheet.orderId}
                  variant="receipt"
                />
                <p className="pos-receipt-barcode-caption">
                  {t('pos.receiptBarcodeCaption')}
                </p>
              </div>
            : null}
            <div className="mt-2 flex flex-col items-center gap-1">
              <TermsQr size={78} />
              <p className="text-[10px] text-muted-foreground">{t('pos.termsQrCaption')}</p>
            </div>
            <div className="pos-receipt-terms">
              <p>الشروط والأحكام:</p>
              <p>
                يبدأ تسليم الطلبات المستعجلة خلال ساعات العمل وفق سياسة الفرع. يرجى مراجعة الفاتورة خلال 24 ساعة
                من الاستلام. المتجر غير مسؤول عن المقتنيات الشخصية داخل الملابس، ولا يلتزم بالتخزين بعد 30 يوماً.
                تعويض القطع التالفة يخضع لسياسة الشركة وبحد أقصى 25% مع إبراز الفاتورة الأصلية.
              </p>
            </div>
          </div>
        ))}
      </section>
      
      {receiptSheets?.length ?
        <section id="pos-item-tags-print" className="hidden" aria-hidden>
          <div className="pos-garment-tags-grid">
            {receiptSheets.flatMap((sheet, sheetIdx) =>
              sheet.lines.flatMap((line, lineIdx) => {
                const n = garmentTagCount(line.quantity);
                return Array.from({ length: n }, (_, i) => (
                  <div
                    key={`${sheet.orderId}-${sheetIdx}-${line.label}-${lineIdx}-${i}`}
                    className="pos-garment-tag"
                    dir="rtl"
                  >
                    <OrderIdBarcode
                      orderId={sheet.orderId}
                      variant="receipt"
                    />
                    <div className="tag-meta">
                      <div>
                        <strong>{t('pos.tagCustomer')}</strong>{' '}
                        {sheet.customerName}
                      </div>
                      <div>
                        <strong>{t('pos.tagBranch')}</strong>{' '}
                        {sheet.branchLabel}
                      </div>
                      <div>
                        <strong>{t('pos.tagGarment')}</strong> {line.label}
                        {n > 1 ? ` (${i + 1}/${n})` : ''}
                      </div>
                    </div>
                  </div>
                ));
              }),
            )}
          </div>
        </section>
      : null}
      
      <OrderDetailDialog
        open={scanOrderDialogOpen}
        onOpenChange={setScanOrderDialogOpen}
        order={scanOrderDetail}
      />
      
      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o);
          if (!o) resetNewCustomerForm();
        }}
      >
        <DialogContent
          className="max-h-[min(90dvh,720px)] max-w-lg overflow-y-auto"
          dir={rtl ? 'rtl' : 'ltr'}
        >
          <DialogHeader className="text-start">
            <DialogTitle>{t('pos.newCustomer.title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="pos-nn" className="text-start">
                {t('pos.newCustomer.name')}
              </Label>
              <Input
                id="pos-nn"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-background text-start"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-np" className="text-start">
                {t('pos.newCustomer.mobile')}
              </Label>
              <Input
                id="pos-np"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="bg-background text-start"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-np2" className="text-start">
                {t('pos.newCustomer.mobileSecondary')}
              </Label>
              <Input
                id="pos-np2"
                value={newPhone2}
                onChange={(e) => setNewPhone2(e.target.value)}
                className="bg-background text-start"
                inputMode="tel"
              />
            </div>
            <p className="pt-1 text-xs font-medium text-muted-foreground">
              {t('pos.newCustomer.addressSection')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pos-a1" className="text-start">
                  {t('pos.newCustomer.addressArea')}
                </Label>
                <Input
                  id="pos-a1"
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pos-a2" className="text-start">
                  {t('pos.newCustomer.addressBlock')}
                </Label>
                <Input
                  id="pos-a2"
                  value={newBlock}
                  onChange={(e) => setNewBlock(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pos-a3" className="text-start">
                  {t('pos.newCustomer.addressStreet')}
                </Label>
                <Input
                  id="pos-a3"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pos-a4" className="text-start">
                  {t('pos.newCustomer.addressAvenue')}
                </Label>
                <Input
                  id="pos-a4"
                  value={newAvenue}
                  onChange={(e) => setNewAvenue(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pos-a5" className="text-start">
                  {t('pos.newCustomer.addressHouse')}
                </Label>
                <Input
                  id="pos-a5"
                  value={newHouse}
                  onChange={(e) => setNewHouse(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
              {t('pos.newCustomer.cancel')}
            </Button>
            <Button
              type="button"
              disabled={savingCustomer}
              onClick={() => void saveNewCustomer()}
            >
              {savingCustomer ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : t('pos.newCustomer.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
