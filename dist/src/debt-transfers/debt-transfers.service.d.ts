import { SafariRole } from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDebtTransferDto } from './dto/create-debt-transfer.dto';
import type { ListDebtTransfersDto } from './dto/list-debt-transfers.dto';
export declare class DebtTransfersService {
    private readonly prisma;
    private readonly generalLedger;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService);
    listDrivers(): Promise<{
        drivers: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        }[];
    }>;
    getDriverOutstandingOrders(driverId: string): Promise<{
        driverId: string;
        orderCount: number;
        totalAmount: string;
        orders: {
            totalPrice: string;
            id: string;
            invoiceNumber: string | null;
            serialNumber: string | null;
            posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
            completedAt: Date | null;
            customer: {
                id: string;
                phone: string;
                displayName: string | null;
            };
        }[];
    }>;
    create(executorId: string, executorRole: SafariRole, dto: CreateDebtTransferDto): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DebtTransferStatus;
        totalAmount: string;
        orderCount: number;
        reason: string | null;
        notes: string | null;
        sourceDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        targetDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        executedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        };
        executedByRole: import("@prisma/client").$Enums.SafariRole;
        sourceSignedAt: Date | null;
        targetSignedAt: Date | null;
        finalizedAt: Date | null;
        cancelledAt: Date | null;
        cancelledReason: string | null;
        cancelledBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        systemSignature: string | null;
        createdAt: Date;
        updatedAt: Date;
        orders: {
            id: string;
            amountSnapshot: string;
            order: {
                totalPrice: string;
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
    }>;
    signAsSource(transferId: string, signerId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DebtTransferStatus;
        totalAmount: string;
        orderCount: number;
        reason: string | null;
        notes: string | null;
        sourceDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        targetDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        executedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        };
        executedByRole: import("@prisma/client").$Enums.SafariRole;
        sourceSignedAt: Date | null;
        targetSignedAt: Date | null;
        finalizedAt: Date | null;
        cancelledAt: Date | null;
        cancelledReason: string | null;
        cancelledBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        systemSignature: string | null;
        createdAt: Date;
        updatedAt: Date;
        orders: {
            id: string;
            amountSnapshot: string;
            order: {
                totalPrice: string;
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
    }>;
    signAsTarget(transferId: string, signerId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DebtTransferStatus;
        totalAmount: string;
        orderCount: number;
        reason: string | null;
        notes: string | null;
        sourceDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        targetDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        executedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        };
        executedByRole: import("@prisma/client").$Enums.SafariRole;
        sourceSignedAt: Date | null;
        targetSignedAt: Date | null;
        finalizedAt: Date | null;
        cancelledAt: Date | null;
        cancelledReason: string | null;
        cancelledBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        systemSignature: string | null;
        createdAt: Date;
        updatedAt: Date;
        orders: {
            id: string;
            amountSnapshot: string;
            order: {
                totalPrice: string;
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
    }>;
    finalize(transferId: string, executorId: string, executorRole: SafariRole): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DebtTransferStatus;
        totalAmount: string;
        orderCount: number;
        reason: string | null;
        notes: string | null;
        sourceDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        targetDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        executedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        };
        executedByRole: import("@prisma/client").$Enums.SafariRole;
        sourceSignedAt: Date | null;
        targetSignedAt: Date | null;
        finalizedAt: Date | null;
        cancelledAt: Date | null;
        cancelledReason: string | null;
        cancelledBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        systemSignature: string | null;
        createdAt: Date;
        updatedAt: Date;
        orders: {
            id: string;
            amountSnapshot: string;
            order: {
                totalPrice: string;
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
    }>;
    cancel(transferId: string, cancellerId: string, cancellerRole: SafariRole, reason: string | null): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DebtTransferStatus;
        totalAmount: string;
        orderCount: number;
        reason: string | null;
        notes: string | null;
        sourceDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        targetDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        executedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        };
        executedByRole: import("@prisma/client").$Enums.SafariRole;
        sourceSignedAt: Date | null;
        targetSignedAt: Date | null;
        finalizedAt: Date | null;
        cancelledAt: Date | null;
        cancelledReason: string | null;
        cancelledBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        systemSignature: string | null;
        createdAt: Date;
        updatedAt: Date;
        orders: {
            id: string;
            amountSnapshot: string;
            order: {
                totalPrice: string;
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
    }>;
    listMine(userId: string): Promise<{
        rows: {
            id: string;
            status: import("@prisma/client").$Enums.DebtTransferStatus;
            totalAmount: string;
            orderCount: number;
            reason: string | null;
            notes: string | null;
            sourceDriver: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
                branchId: string | null;
            };
            targetDriver: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
                branchId: string | null;
            };
            executedBy: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
            };
            executedByRole: import("@prisma/client").$Enums.SafariRole;
            sourceSignedAt: Date | null;
            targetSignedAt: Date | null;
            finalizedAt: Date | null;
            cancelledAt: Date | null;
            cancelledReason: string | null;
            cancelledBy: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
            } | null;
            systemSignature: string | null;
            createdAt: Date;
            updatedAt: Date;
            orders: {
                id: string;
                amountSnapshot: string;
                order: {
                    totalPrice: string;
                    id: string;
                    status: import("@prisma/client").$Enums.OrderStatus;
                    cashStatus: import("@prisma/client").$Enums.CashStatus;
                    invoiceNumber: string | null;
                    serialNumber: string | null;
                    posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                    completedAt: Date | null;
                    customer: {
                        id: string;
                        phone: string;
                        displayName: string | null;
                    };
                };
            }[];
        }[];
    }>;
    findOne(id: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DebtTransferStatus;
        totalAmount: string;
        orderCount: number;
        reason: string | null;
        notes: string | null;
        sourceDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        targetDriver: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        executedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        };
        executedByRole: import("@prisma/client").$Enums.SafariRole;
        sourceSignedAt: Date | null;
        targetSignedAt: Date | null;
        finalizedAt: Date | null;
        cancelledAt: Date | null;
        cancelledReason: string | null;
        cancelledBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        systemSignature: string | null;
        createdAt: Date;
        updatedAt: Date;
        orders: {
            id: string;
            amountSnapshot: string;
            order: {
                totalPrice: string;
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
            };
        }[];
    }>;
    list(filters: ListDebtTransfersDto): Promise<{
        total: number;
        limit: number;
        offset: number;
        rows: {
            id: string;
            status: import("@prisma/client").$Enums.DebtTransferStatus;
            totalAmount: string;
            orderCount: number;
            reason: string | null;
            notes: string | null;
            sourceDriver: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
                branchId: string | null;
            };
            targetDriver: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
                branchId: string | null;
            };
            executedBy: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
            };
            executedByRole: import("@prisma/client").$Enums.SafariRole;
            sourceSignedAt: Date | null;
            targetSignedAt: Date | null;
            finalizedAt: Date | null;
            cancelledAt: Date | null;
            cancelledReason: string | null;
            cancelledBy: {
                id: string;
                username: string;
                fullName: string;
                safariRole: import("@prisma/client").$Enums.SafariRole;
            } | null;
            systemSignature: string | null;
            createdAt: Date;
            updatedAt: Date;
            orders: {
                id: string;
                amountSnapshot: string;
                order: {
                    totalPrice: string;
                    id: string;
                    status: import("@prisma/client").$Enums.OrderStatus;
                    cashStatus: import("@prisma/client").$Enums.CashStatus;
                    invoiceNumber: string | null;
                    serialNumber: string | null;
                    posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                    completedAt: Date | null;
                    customer: {
                        id: string;
                        phone: string;
                        displayName: string | null;
                    };
                };
            }[];
        }[];
    }>;
    private serialize;
}
