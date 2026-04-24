"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KUWAIT_CUSTOMER_PHONE_PATTERN = void 0;
exports.kuwaitPhoneDigitsForMoatmt = kuwaitPhoneDigitsForMoatmt;
exports.pickFirstKuwaitMobileForWhatsApp = pickFirstKuwaitMobileForWhatsApp;
exports.resolveCustomerPhoneForNotify = resolveCustomerPhoneForNotify;
exports.IsKuwaitCustomerPhone = IsKuwaitCustomerPhone;
const class_validator_1 = require("class-validator");
exports.KUWAIT_CUSTOMER_PHONE_PATTERN = /^(\+?965)?[569]\d{7}$/;
function kuwaitPhoneDigitsForMoatmt(phone) {
    const d = phone.replace(/[\s\-+]/g, '');
    if (d.length === 8 && /^[569]\d{7}$/.test(d)) {
        return `965${d}`;
    }
    if (d.length === 11 && d.startsWith('965') && /^965[569]\d{7}$/.test(d)) {
        return d;
    }
    if (d.length === 12 && d.startsWith('00965') && /^00965[569]\d{7}$/.test(d)) {
        return d.slice(2);
    }
    if (d.length > 0 && d.startsWith('965') && d.length >= 11) {
        return d;
    }
    return null;
}
function pickFirstKuwaitMobileForWhatsApp(...candidates) {
    for (const c of candidates) {
        const t = c?.trim();
        if (t && kuwaitPhoneDigitsForMoatmt(t)) {
            return t;
        }
    }
    return null;
}
function resolveCustomerPhoneForNotify(...candidates) {
    const picked = pickFirstKuwaitMobileForWhatsApp(...candidates);
    if (picked) {
        return picked;
    }
    for (const c of candidates) {
        const t = c?.trim();
        if (t) {
            return t;
        }
    }
    return '';
}
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