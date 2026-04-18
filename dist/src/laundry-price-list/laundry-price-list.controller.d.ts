import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { UpdateLaundryCategoryDto } from './dto/update-laundry-category.dto';
import { UpdateLaundryPriceItemDto } from './dto/update-laundry-price-item.dto';
import { LaundryPriceListService } from './laundry-price-list.service';
export declare class LaundryPriceListController {
    private readonly laundryPriceListService;
    constructor(laundryPriceListService: LaundryPriceListService);
    findCategories(): Promise<import("./laundry-price-list.service").LaundryItemCategoryDto[]>;
    findAll(branchId: string | undefined, user: JwtUser): Promise<import("./laundry-price-list.service").LaundryPriceListItemDto[]>;
    updateItem(id: string, dto: UpdateLaundryPriceItemDto): Promise<import("./laundry-price-list.service").LaundryPriceListItemDto>;
    updateCategory(id: string, dto: UpdateLaundryCategoryDto): Promise<import("./laundry-price-list.service").LaundryItemCategoryDto>;
}
