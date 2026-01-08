import { UserRole } from '../constants/enums';
export interface User {
    id: number;
    username: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
}
export interface RegisterDto {
    username: string;
    email: string;
    password: string;
}
export interface LoginDto {
    username: string;
    password: string;
}
export interface UpdateUserDto {
    email?: string;
    password?: string;
    role?: UserRole;
}
export interface AuthResponse {
    user: User;
    token: string;
}
export interface JwtPayload {
    sub: number;
    username: string;
    role: UserRole;
}
