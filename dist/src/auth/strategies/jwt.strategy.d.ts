import { Strategy } from 'passport-jwt';
export type JwtPayload = {
    sub: string;
    role: string;
    branchId?: string | null;
};
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    constructor();
    validate(payload: JwtPayload): {
        userId: string;
        role: string;
        branchId: string | null;
    };
}
export {};
