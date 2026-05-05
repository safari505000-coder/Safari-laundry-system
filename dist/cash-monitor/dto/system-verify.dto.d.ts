export type SystemVerifyVerdict = 'PASS' | 'FAIL';
export declare class SystemVerifyCheckDto {
    scenario: string;
    expected: 'GREEN' | 'YELLOW' | 'RED';
    classified: 'GREEN' | 'YELLOW' | 'RED';
    risk: 'GREEN' | 'YELLOW' | 'RED';
    executive: 'GREEN' | 'YELLOW' | 'RED';
    financialAlerts: number;
    complianceAlerts: number;
    ok: boolean;
}
export declare class SystemVerifyResponseDto {
    status: SystemVerifyVerdict;
    blocked: boolean;
    checks: SystemVerifyCheckDto[];
    mismatches: string[];
    generatedAt: string;
    readOnly: true;
}
