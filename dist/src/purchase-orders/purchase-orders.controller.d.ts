import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
export declare class PurchaseOrdersController {
    private readonly service;
    constructor(service: PurchaseOrdersService);
    list(q: ListPurchaseOrdersQueryDto): Promise<{
        rows: import("./purchase-orders.service").PurchaseOrderListRow[];
        total: number;
    }>;
    findOne(id: string): Promise<import("./purchase-orders.service").PurchaseOrderDetail>;
    create(dto: CreatePurchaseOrderDto, user: JwtUser): Promise<import("./purchase-orders.service").PurchaseOrderDetail>;
    send(id: string, user: JwtUser): Promise<import("./purchase-orders.service").PurchaseOrderDetail>;
    cancel(id: string, dto: {
        reason?: string;
    }, user: JwtUser): Promise<import("./purchase-orders.service").PurchaseOrderDetail>;
    receive(id: string, dto: ReceivePurchaseOrderDto, user: JwtUser): Promise<import("./purchase-orders.service").PurchaseOrderDetail>;
}
