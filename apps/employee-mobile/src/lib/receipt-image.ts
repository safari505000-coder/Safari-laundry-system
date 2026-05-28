export const RECEIPT_MAX_DATA_URL_LENGTH = 480_000;
export const RECEIPT_RESIZE_WIDTH = 960;
export const RECEIPT_COMPRESS_LEVELS = [0.7, 0.58, 0.46, 0.34] as const;

export function receiptFitsPayloadLimit(dataUrl: string): boolean {
  return dataUrl.length <= RECEIPT_MAX_DATA_URL_LENGTH;
}
