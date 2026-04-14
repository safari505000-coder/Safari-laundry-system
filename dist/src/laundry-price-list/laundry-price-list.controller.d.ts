import { LaundryPriceListService } from './laundry-price-list.service';
export declare class LaundryPriceListController {
    private readonly laundryPriceListService;
    constructor(laundryPriceListService: LaundryPriceListService);
    findAll(): Promise<import("./laundry-price-list.service").LaundryPriceListItemDto[]>;
}
