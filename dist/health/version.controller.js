"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const region_1 = require("../common/config/region");
const app_version_1 = require("../common/constants/app-version");
const branding_1 = require("../common/constants/branding");
let VersionController = class VersionController {
    startedAtMs = Date.now();
    get() {
        return {
            name: branding_1.APP_BRAND,
            version: app_version_1.APP_VERSION,
            timestamp: new Date().toISOString(),
            gitCommit: process.env.GIT_COMMIT ??
                process.env.BUILD_SHA ??
                'unknown',
            buildTime: process.env.BUILD_TIME ?? 'unknown',
            node: process.version,
            env: process.env.NODE_ENV ?? 'development',
            uptime: Math.round(process.uptime()),
            startedAt: new Date(this.startedAtMs).toISOString(),
            region: (0, region_1.deploymentRegion)(),
            deploymentColor: (0, region_1.deploymentColor)(),
        };
    }
};
exports.VersionController = VersionController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: `Build identity (${branding_1.APP_BRAND})`,
        description: 'Returns name, version, git commit, build time, Node.js runtime ' +
            'version, environment, uptime (seconds) and boot timestamp. ' +
            'Public — no auth — so deployment verifiers and load-balancer ' +
            'health targets can compare the live build to the expected one.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], VersionController.prototype, "get", null);
exports.VersionController = VersionController = __decorate([
    (0, swagger_1.ApiTags)('version'),
    (0, common_1.Controller)('version'),
    (0, roles_decorator_1.Public)('Deployment version endpoint contains only build identity metadata.')
], VersionController);
//# sourceMappingURL=version.controller.js.map