"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KUWAIT_CUSTOMER_PHONE_PATTERN = void 0;
exports.IsKuwaitCustomerPhone = IsKuwaitCustomerPhone;
const class_validator_1 = require("class-validator");
exports.KUWAIT_CUSTOMER_PHONE_PATTERN = /^(\+?965)?[569]\d{7}$/;
function IsKuwaitCustomerPhone(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isKuwaitCustomerPhone',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value) {
                    if (typeof value !== 'string')
                        return false;
                    const compact = value.replace(/[\s-]/g, '');
                    return exports.KUWAIT_CUSTOMER_PHONE_PATTERN.test(compact);
                },
                defaultMessage() {
                    return ('customerPhone must be a valid Kuwait mobile: optional +965/965, ' +
                        'then 8 digits starting with 5, 6, or 9 (e.g. +96551234567 or 51234567)');
                },
            },
        });
    };
}
//# sourceMappingURL=kuwait-customer-phone.js.map