import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
export type UserPublic = Prisma.UserGetPayload<{
    select: Prisma.UserSelect;
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
