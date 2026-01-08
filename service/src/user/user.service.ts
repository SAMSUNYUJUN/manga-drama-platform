/**
 * 用户服务
 * @module user
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities';
import { UpdateUserDto } from './dto';
import { UserRole } from '@shared/constants';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 获取用户详情
   */
  async findOne(id: number, requestingUser: User): Promise<User> {
    // 权限检查：只能查看自己的信息或管理员可以查看所有
    if (requestingUser.id !== id && requestingUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own profile');
    }

    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  /**
   * 更新用户信息
   */
  async update(id: number, updateUserDto: UpdateUserDto, requestingUser: User): Promise<User> {
    // 权限检查：只能更新自己的信息或管理员可以更新所有
    if (requestingUser.id !== id && requestingUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // 只有管理员可以修改角色
    if (updateUserDto.role && requestingUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can change user roles');
    }

    // 检查邮箱是否已被使用
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    // 更新密码需要加密
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    // 更新用户信息
    Object.assign(user, updateUserDto);
    await this.userRepository.save(user);

    return this.sanitizeUser(user);
  }

  /**
   * 删除用户（仅管理员）
   */
  async remove(id: number, requestingUser: User): Promise<void> {
    if (requestingUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can delete users');
    }

    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // 不能删除自己
    if (user.id === requestingUser.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    await this.userRepository.remove(user);
  }

  /**
   * 清理用户敏感信息
   */
  private sanitizeUser(user: User): User {
    const { password, ...sanitized } = user;
    return sanitized as User;
  }
}
