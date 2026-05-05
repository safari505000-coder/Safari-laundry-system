export type CashExecutionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type CashExecutionAction = 'CONTACTED' | 'FOLLOWED_UP' | 'ESCALATED';
export declare class CashExecutionActionRequestDto {
    driverId: string;
    action: CashExecutionAction;
    note?: string;
    alertType?: string;
}
export declare class CashExecutionBlockDto {
    status: CashExecutionStatus;
    lastAction: CashExecutionAction | null;
    lastActionAt: string | null;
    lastActor: string | null;
    flagsToday: number;
    flagsThisWeek: number;
    repeatIssue: boolean;
}
export declare class CashExecutionActionResponseDto {
    driverId: string;
    recordedAt: string;
    execution: CashExecutionBlockDto;
    readOnlyFinancial: true;
}
