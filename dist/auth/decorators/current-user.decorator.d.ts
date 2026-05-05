export type JwtUser = {
    userId: string;
    role: string;
    branchId: string | null;
    scope?: 'ALL' | 'BRANCH' | 'OWN';
    linkedCustomerId?: string | null;
};
export declare const CurrentUser: (...dataOrPipes: (keyof JwtUser | import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
