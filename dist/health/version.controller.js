"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const branding_1 = require("../common/constants/branding");
let VersionController = class VersionController {
    version;
    startedAtMs = Date.now();
    constructor() {
        this.version = readPackageVersion();
    }
    get() {
        return {
            name: branding_1.APP_BRAND,
            version: this.version,
            gitCommit: process.env.GIT_COMMIT ??
                process.env.BUILD_SHA ??
                'unknown',
            buildTime: process.env.BUILD_TIME ?? 'unknown',
            node: process.version,
            env: process.env.NODE_ENV ?? 'development',
            uptime: Math.round(process.uptime()),
            startedAt: new Date(this.startedAtMs).toISOString(),
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
    __metadata("design:paramtypes", [])
], VersionController);
function readPackageVersion() {
    let dir = __dirname;
    for (let hops = 0; hops < 6; hops++) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) {
            try {
                const raw = fs.readFileSync(candidate, 'utf8');
                const json = JSON.parse(raw);
                if (json.version)
                    return json.version;
            }
            catch {
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return 'unknown';
}
//# sourceMappingURL=version.controller.js.map