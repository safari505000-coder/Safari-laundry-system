"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertInstitutionalMutationAllowed = assertInstitutionalMutationAllowed;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
function assertInstitutionalMutationAllowed(role) {
    const r = typeof role === 'string' ?
        role.trim().toUpperCase()
        : role === null || role === undefined ?
            ''
            : String(role).trim().toUpperCase();
    if (r === client_1.SafariRole.GENERAL_MANAGER || r === 'GENERAL_MANAGER') {
        throw new common_1.ForbiddenException('Read-only role');
    }
}
//# sourceMappingURL=institutional-mutation.util.js.map