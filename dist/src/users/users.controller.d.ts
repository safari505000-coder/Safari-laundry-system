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
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
        employeeId: string | null;
        username: string;
        fullName: string;
        phone: string | null;
        jobTitle: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
    }>;
    findAll(): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
        employeeId: string | null;
        username: string;
        fullName: string;
        phone: string | null;
        jobTitle: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
        employeeId: string | null;
        username: string;
        fullName: string;
        phone: string | null;
        jobTitle: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
    }>;
    update(id: string, dto: UpdateUserDto): Promise<{
        id: string;
        roleId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        role: {
            id: string;
            name: string;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        } | null;
        employeeId: string | null;
        username: string;
        fullName: string;
        phone: string | null;
        jobTitle: string | null;
        safariRole: import("@prisma/client").$Enums.SafariRole;
    }>;
    remove(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
