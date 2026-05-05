"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploymentRegion = deploymentRegion;
exports.isSecondaryRegion = isSecondaryRegion;
exports.deploymentColor = deploymentColor;
function deploymentRegion() {
    return (process.env.REGION ?? 'primary').toLowerCase();
}
function isSecondaryRegion() {
    return deploymentRegion() === 'secondary';
}
function deploymentColor() {
    return (process.env.DEPLOYMENT_COLOR ??
        process.env.DEPLOYMENT_SLOT ??
        'blue').toLowerCase();
}
//# sourceMappingURL=region.js.map