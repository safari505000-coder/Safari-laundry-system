import fs from 'node:fs';
const body = fs.readFileSync('src/modules/shared/components/pos/_aux-body.txt', 'utf8');

const head = `import { Loader2, Minus, Plus } from 'lucide-react';
import { OrderDetailDialog } from '@/components/orders/order-detail-dialog';
import { OrderIdBarcode } from '@/components/orders/order-id-barcode';
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
    serviceNesha,
    setServiceNesha,
    serviceNeshaLevel,
    setServiceNeshaLevel,
    serviceFolding,
    setServiceFolding,
    serviceFoldingStyle,
    setServiceFoldingStyle,
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

  return (
    <>
`;

const out = `${head}${body
  .split('\n')
  .map((l) => (l ? `      ${l}` : ''))
  .join('\n')}
    </>
  );
}
`;

fs.writeFileSync('src/modules/shared/components/pos/pos-auxiliary-ui.tsx', out);
