/**
 * Re-export — canonical tariff lives in `src/bootstrap/laundry-price-list.seed.ts`
 * so Nest `nest build` compiles a single source used on boot + `prisma db seed`.
 */
export { seedLaundryPriceList } from '../src/bootstrap/laundry-price-list.seed';
