import { Prisma } from "@prisma/client";
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
export type UserPublic = Prisma.UserGetPayload<{
    select: Prisma.UserSelect;
}>;
export declare class UsersService {
    private readonly prisma;
    private readonly permissionsService;
    constructor(prisma: PrismaService, permissionsService: PermissionsService);
    private resolveRoleId;
    create(dto: CreateUserDto): Promise<UserPublic>;
    findAll(): Promise<UserPublic[]>;
    findOne(id: string): Promise<UserPublic>;
    update(id: string, dto: UpdateUserDto): Promise<UserPublic>;
    setActive(id: string, isActive: boolean): Promise<UserPublic>;
    updateSalaryDefaults(id: string, dto: {
        basicMonthlySalary?: number | null;
        monthlyAllowances?: number | null;
        payrollRosterLineOrder?: number | null;
        bankName?: string | null;
        bankIban?: string | null;
    }): Promise<UserPublic>;
    remove(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
