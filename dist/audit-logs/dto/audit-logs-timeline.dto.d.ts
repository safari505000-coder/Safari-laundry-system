export declare class AuditLogTimelineRowDto {
    action: string;
    amount: string | null;
    source: string | null;
    userId: string | null;
    timestamp: string;
}
export declare class AuditLogTimelineResponseDto {
    rows: AuditLogTimelineRowDto[];
}
