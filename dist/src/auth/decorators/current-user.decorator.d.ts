export type JwtUser = {
    userId: string;
    role: string;
};
export declare const CurrentUser: (...dataOrPipes: (keyof JwtUser | import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
