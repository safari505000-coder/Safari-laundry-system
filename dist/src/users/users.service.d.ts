import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
declare const userPublicSelect: {
    id: true;
    username: true;
    fullName: true;
    employeeId: true;
    jobTitle: true;
    phone: true;
    safariRole: true;
    roleId: true;
    branchId: true;
    createdAt: true;
    updatedAt: true;
    role: {
        select: {
            id: true;
            name: true;
        };
    };
    branch: {
        select: {
            id: true;
            name: true;
            location: true;
        };
    };
};
export type UserPublic = Prisma.UserGetPayload<{
    select: typeof userPublicSelect;
}>;
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private resolveRoleId;
    create(dto: CreateUserDto): Promise<UserPublic>;
    findAll(): Promise<UserPublic[]>;
    findOne(id: string): Promise<UserPublic>;
    update(id: string, dto: UpdateUserDto): Promise<UserPublic>;
    remove(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
export {};
