import { Prisma } from '@prisma/client';

/** Safe client-facing copy for common Prisma failures (details still logged server-side). */
export function prismaClientMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return 'A record with this value already exists.';
      case 'P2003':
        return 'A related record is missing or invalid.';
      case 'P2011':
        return 'A required field was empty.';
      case 'P2025':
        return 'Record not found.';
      default:
        return 'A database error occurred. Please try again.';
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return 'Invalid data was sent. Check your input and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Logs Prisma errors with code/meta; other errors with full payload. */
export function logServerError(context: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(
      `[${context}] Prisma ${error.code}`,
      error.meta,
      error.message,
    );
    return;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(`[${context}] Prisma validation`, error.message);
    return;
  }
  console.error(`[${context}]`, error);
}
