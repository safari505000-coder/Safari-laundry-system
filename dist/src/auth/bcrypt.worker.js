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
Object.defineProperty(exports, "__esModule", { value: true });
const node_worker_threads_1 = require("node:worker_threads");
const bcrypt = __importStar(require("bcrypt"));
if (!node_worker_threads_1.parentPort) {
    throw new Error('bcrypt.worker must be run as a worker_threads entry');
}
node_worker_threads_1.parentPort.on('message', (msg) => {
    const reply = (payload) => node_worker_threads_1.parentPort.postMessage(payload);
    const run = async () => {
        switch (msg.action) {
            case 'hash':
                return bcrypt.hash(msg.payload.password, msg.payload.rounds);
            case 'compare':
                return bcrypt.compare(msg.payload.password, msg.payload.hash);
            default:
                throw new Error(`unknown bcrypt worker action`);
        }
    };
    run()
        .then((result) => reply({ id: msg.id, result }))
        .catch((err) => reply({
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
    }));
});
//# sourceMappingURL=bcrypt.worker.js.map