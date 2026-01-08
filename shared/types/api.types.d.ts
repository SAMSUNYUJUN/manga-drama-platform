export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: ApiError;
}
export interface ApiError {
    code: string;
    message: string;
    details?: any;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface PaginationQuery {
    page?: number;
    limit?: number;
}
export interface SortQuery {
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
}
export interface QueryParams extends PaginationQuery, SortQuery {
    [key: string]: any;
}
