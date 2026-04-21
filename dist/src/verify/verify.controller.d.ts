import { VerifyService } from './verify.service';
export declare class VerifyController {
    private readonly verify;
    constructor(verify: VerifyService);
    verifyPayslip(id: string): Promise<import("./verify.service").VerifyResult>;
    verifyLeave(id: string): Promise<import("./verify.service").VerifyResult>;
    verifyLoan(id: string): Promise<import("./verify.service").VerifyResult>;
    verifyStatement(id: string): Promise<import("./verify.service").VerifyResult>;
}
