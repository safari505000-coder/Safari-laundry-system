import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(dto: CreateUserDto): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        fullName: string;
        employeeId: string | null;
        jobTitle: string | null;
        phone: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
    }>;
    findAll(): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        fullName: string;
        employeeId: string | null;
        jobTitle: string | null;
        phone: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        fullName: string;
        employeeId: string | null;
        jobTitle: string | null;
        phone: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
    }>;
    update(id: string, dto: UpdateUserDto): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        username: string;
        fullName: string;
        employeeId: string | null;
        jobTitle: string | null;
        phone: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
    }>;
    remove(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
