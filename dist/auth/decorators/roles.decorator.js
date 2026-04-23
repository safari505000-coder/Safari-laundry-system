"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllowDriverDailyPosSales = exports.DRIVER_FINANCE_DAILY_POS_KEY = exports.Roles = exports.ROLES_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.ROLES_KEY = 'safariRoles';
const Roles = (...roles) => (0, common_1.SetMetadata)(exports.ROLES_KEY, roles);
exports.Roles = Roles;
exports.DRIVER_FINANCE_DAILY_POS_KEY = 'driverFinanceDailyPosSales';
const AllowDriverDailyPosSales = () => (0, common_1.SetMetadata)(exports.DRIVER_FINANCE_DAILY_POS_KEY, true);
exports.AllowDriverDailyPosSales = AllowDriverDailyPosSales;
//# sourceMappingURL=roles.decorator.js.map