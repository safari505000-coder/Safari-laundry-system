import { BadRequestException } from '@nestjs/common';
import {
  ExpenseCategory,
  ExpenseMethod,
  ExpenseStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { ExpensesService } from './expenses.service';

const USER_ID = 'driver-1';
const BRANCH_ID = 'branch-1';
const RECEIPT = `data:image/jpeg;base64,${'a'.repeat(64)}`;

function makeService() {
  const tx = {
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalPrice: 0 } }),
    },
    branchExpense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      create: jest.fn().mockResolvedValue({
        id: 'expense-1',
        title: 'وقود',
        amount: new Prisma.Decimal('1.2500'),
        category: ExpenseCategory.FUEL,
        expenseMethod: ExpenseMethod.PREPAID_CARD,
        status: ExpenseStatus.PENDING_ACCOUNTANT,
        note: null,
        receiptUrl: RECEIPT,
        recordedById: USER_ID,
        branchId: BRANCH_ID,
        recordedBy: { id: USER_ID, fullName: 'Driver', username: 'driver' },
        branch: { id: BRANCH_ID, name: 'Main' },
      }),
    },
    deposit: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ branchId: BRANCH_ID }),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const generalLedger = {
    append: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ExpensesService(
    prisma as unknown as ConstructorParameters<typeof ExpensesService>[0],
    generalLedger as unknown as ConstructorParameters<typeof ExpensesService>[1],
  );
  return { service, tx };
}

describe('ExpensesService receipt guards', () => {
  it('rejects driver field expenses without receipt photo', async () => {
    const { service } = makeService();

    await expect(
      service.create(USER_ID, SafariRole.DRIVER, {
        title: 'وقود',
        amount: 1.25,
        category: ExpenseCategory.FUEL,
        expenseMethod: ExpenseMethod.PREPAID_CARD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-image receipt references for driver expenses', async () => {
    const { service } = makeService();

    await expect(
      service.create(USER_ID, SafariRole.DRIVER, {
        title: 'وقود',
        amount: 1.25,
        category: ExpenseCategory.FUEL,
        expenseMethod: ExpenseMethod.PREPAID_CARD,
        receiptUrl: 'https://example.test/receipt.jpg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists official receipt data URL for valid driver expenses', async () => {
    const { service, tx } = makeService();

    await service.create(USER_ID, SafariRole.DRIVER, {
      title: 'وقود',
      amount: 1.25,
      category: ExpenseCategory.FUEL,
      expenseMethod: ExpenseMethod.PREPAID_CARD,
      receiptUrl: `  ${RECEIPT}  `,
    });

    expect(tx.branchExpense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiptUrl: RECEIPT,
          expenseMethod: ExpenseMethod.PREPAID_CARD,
        }),
      }),
    );
  });
});
