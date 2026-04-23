import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { DebtTransfersService } from './debt-transfers.service';
import { CancelDebtTransferDto } from './dto/cancel-debt-transfer.dto';
import { CreateDebtTransferDto } from './dto/create-debt-transfer.dto';
import { ListDebtTransfersDto } from './dto/list-debt-transfers.dto';
export declare class DebtTransfersController {
    private readonly service;
    constructor(service: DebtTransfersService);
    list(query: ListDebtTransfersDto): Promise<{
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
                    customer: {
                        id: string;
                        phone: string;
                        displayName: string | null;
                    };
                    id: string;
                    status: import("@prisma/client").$Enums.OrderStatus;
                    cashStatus: import("@prisma/client").$Enums.CashStatus;
                    invoiceNumber: string | null;
                    serialNumber: string | null;
                    posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                    completedAt: Date | null;
                };
            }[];
        }[];
    }>;
    mine(user: JwtUser): Promise<{
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
                    customer: {
                        id: string;
                        phone: string;
                        displayName: string | null;
                    };
                    id: string;
                    status: import("@prisma/client").$Enums.OrderStatus;
                    cashStatus: import("@prisma/client").$Enums.CashStatus;
                    invoiceNumber: string | null;
                    serialNumber: string | null;
                    posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                    completedAt: Date | null;
                };
            }[];
        }[];
    }>;
    listDrivers(): Promise<{
        drivers: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        }[];
    }>;
    outstanding(driverId: string): Promise<{
        driverId: string;
        orderCount: number;
        totalAmount: string;
        orders: {
            totalPrice: string;
            customer: {
                id: string;
                phone: string;
                displayName: string | null;
            };
            id: string;
            invoiceNumber: string | null;
            serialNumber: string | null;
            posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
            completedAt: Date | null;
        }[];
    }>;
    findOne(id: string, user: JwtUser): Promise<{
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
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
            };
        }[];
    }>;
    create(dto: CreateDebtTransferDto, user: JwtUser): Promise<{
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
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
            };
        }[];
    }>;
    finalize(id: string, user: JwtUser): Promise<{
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
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
            };
        }[];
    }>;
    cancel(id: string, dto: CancelDebtTransferDto, user: JwtUser): Promise<{
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
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
            };
        }[];
    }>;
    signSource(id: string, user: JwtUser): Promise<{
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
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
            };
        }[];
    }>;
    signTarget(id: string, user: JwtUser): Promise<{
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
                customer: {
                    id: string;
                    phone: string;
                    displayName: string | null;
                };
                id: string;
                status: import("@prisma/client").$Enums.OrderStatus;
                cashStatus: import("@prisma/client").$Enums.CashStatus;
                invoiceNumber: string | null;
                serialNumber: string | null;
                posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
                completedAt: Date | null;
            };
        }[];
    }>;
}
