import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('PrismaException');

/** Safe client-facing copy for common Prisma failures (details still logged server-side). */
export function prismaClientMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return 'A record with this value already exists (duplicate key). If this was checkout, try again — the wallet row may have been created concurrently.';
      case 'P2003':
        return 'A related record is missing or invalid (foreign key). Check customer, driver, or order links.';
      case 'P2006':
        return 'Invalid value stored in the database for a field. Contact support with the time of the error.';
      case 'P2010':
        return 'Database schema mismatch. Ensure migrations are applied, then try again.';
      case 'P2011':
        return 'A required field was empty.';
      case 'P2014':
        return 'A database relation would be broken by this change. The related rows may need to be updated first.';
      case 'P2021':
        return 'A required database table is missing. Run `npx prisma migrate deploy` on the server, then try again.';
      case 'P2022':
        return 'A required database column is missing. Run migrations, then try again.';
      case 'P2025':
        return 'Record not found.';
      /** Connection / pool issues — not fixed by migrations. */
      case 'P1001':
        return 'Cannot reach the database server. Check DATABASE_URL and network, then try again.';
      case 'P1017':
      case 'P1008':
        return 'Database connection was closed or interrupted. Retry the operation.';
      case 'P2024':
        return 'Timed out waiting for a database connection from the pool. Retry in a moment or reduce concurrent load.';
      /** Interactive transaction exceeded `timeout` (Nest often sets 15s). */
      case 'P2028':
        return 'Database transaction timed out or was aborted. Retry the operation.';
      /** Retriable serialization / deadlock-style conflict. */
      case 'P2034':
        return 'A concurrent database write conflict occurred. Retry the operation.';
      default:
        // Safer to expose the Prisma code for support logs; UI maps to Arabic in web `apiJson`.
        return `A database error occurred (${error.code}). Please try again, or run migrations if the system was just updated.`;
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return 'Invalid data was sent. Check your input and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Logs Prisma errors with bounded diagnostics; never logs full row payloads. */
export function logServerError(context: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(
      `[${context}] Prisma ${error.code} meta=${JSON.stringify(error.meta ?? {})}`,
    );
    return;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error(`[${context}] Prisma validation`);
    return;
  }
  logger.error(
    `[${context}] ${error instanceof Error ? error.message : String(error)}`,
  );
}
