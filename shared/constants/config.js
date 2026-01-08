"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_CONFIG = exports.FILE_UPLOAD = exports.USERNAME_RULES = exports.PASSWORD_RULES = exports.PAGINATION = void 0;
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
};
exports.PASSWORD_RULES = {
    MIN_LENGTH: 6,
    MAX_LENGTH: 32,
};
exports.USERNAME_RULES = {
    MIN_LENGTH: 3,
    MAX_LENGTH: 50,
};
exports.FILE_UPLOAD = {
    MAX_SIZE: 100 * 1024 * 1024,
    MAX_CONCURRENT: 3,
};
exports.JWT_CONFIG = {
    EXPIRES_IN: '24h',
};
//# sourceMappingURL=config.js.map