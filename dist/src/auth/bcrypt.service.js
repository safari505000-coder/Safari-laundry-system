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
var BcryptService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BcryptService = void 0;
const common_1 = require("@nestjs/common");
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const node_worker_threads_1 = require("node:worker_threads");
let BcryptService = BcryptService_1 = class BcryptService {
    logger = new common_1.Logger(BcryptService_1.name);
    workers = [];
    pending = new Map();
    nextId = 1;
    rr = 0;
    rounds = this.resolveRounds();
    onModuleInit() {
        const size = this.resolvePoolSize();
        const workerFile = path.join(__dirname, 'bcrypt.worker.js');
        for (let i = 0; i < size; i++) {
            const w = new node_worker_threads_1.Worker(workerFile);
            w.on('message', (msg) => {
                const job = this.pending.get(msg.id);
                if (!job)
                    return;
                this.pending.delete(msg.id);
                if (msg.error)
                    job.reject(new Error(msg.error));
                else
                    job.resolve(msg.result);
            });
            w.on('error', (err) => {
                this.logger.error(`bcrypt worker error: ${err.message}`);
            });
            w.on('exit', (code) => {
                if (code !== 0) {
                    this.logger.warn(`bcrypt worker exited code=${code}`);
                }
            });
            this.workers.push(w);
        }
        this.logger.log(`bcrypt pool ready (workers=${size}, rounds=${this.rounds})`);
    }
    async onModuleDestroy() {
        for (const [, job] of this.pending) {
            job.reject(new Error('bcrypt service shutting down'));
        }
        this.pending.clear();
        await Promise.all(this.workers.map((w) => w.terminate()));
    }
    async hash(password, rounds) {
        return this.dispatch('hash', {
            password,
            rounds: rounds ?? this.rounds,
        });
    }
    async compare(password, hash) {
        return this.dispatch('compare', { password, hash });
    }
    dispatch(action, payload) {
        if (this.workers.length === 0) {
            return Promise.reject(new Error('bcrypt pool is empty'));
        }
        const id = this.nextId++;
        const worker = this.workers[this.rr++ % this.workers.length];
        return new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve: resolve,
                reject,
            });
            worker.postMessage({ id, action, payload });
        });
    }
    resolvePoolSize() {
        const raw = Number.parseInt(process.env.BCRYPT_WORKERS ?? '', 10);
        if (Number.isFinite(raw) && raw > 0)
            return raw;
        const cpus = os.cpus()?.length ?? 4;
        return Math.max(2, Math.min(cpus - 4, 16));
    }
    resolveRounds() {
        const raw = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '', 10);
        if (Number.isFinite(raw) && raw >= 4 && raw <= 15)
            return raw;
        return 10;
    }
};
exports.BcryptService = BcryptService;
exports.BcryptService = BcryptService = BcryptService_1 = __decorate([
    (0, common_1.Injectable)()
], BcryptService);
//# sourceMappingURL=bcrypt.service.js.map