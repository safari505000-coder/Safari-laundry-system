import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { LaundryPriceListService } from './laundry-price-list.service';
export declare class LaundryPriceListController {
    private readonly laundryPriceListService;
    constructor(laundryPriceListService: LaundryPriceListService);
    findCategories(): Promise<import("./laundry-price-list.service").LaundryItemCategoryDto[]>;
    findAll(branchId: string | undefined, user: JwtUser): Promise<import("./laundry-price-list.service").LaundryPriceListItemDto[]>;
}
