/**
 * 侧边导航栏
 * @module components/Layout/Sidebar
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './Sidebar.module.scss';

export const Sidebar = () => {
  const { user } = useAuth();
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.sidebarNav}>
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>
          📊 仪表板
        </NavLink>
        <NavLink to="/workbench" className={({ isActive }) => isActive ? styles.active : ''}>
          🎬 漫剧工作台
        </NavLink>
        <NavLink to="/storyboard-gacha" className={({ isActive }) => isActive ? styles.active : ''}>
          🎴 分镜抽卡
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => isActive ? styles.active : ''}>
          📋 任务列表
        </NavLink>
        <NavLink to="/workflows" className={({ isActive }) => isActive ? styles.active : ''}>
          🧩 工作流
        </NavLink>
        <NavLink to="/prompts" className={({ isActive }) => isActive ? styles.active : ''}>
          ✍️ Prompt
        </NavLink>
        <NavLink to="/assets" className={({ isActive }) => isActive ? styles.active : ''}>
          🎨 资产管理
        </NavLink>
        <NavLink to="/trash" className={({ isActive }) => isActive ? styles.active : ''}>
          🗑️ 垃圾桶
        </NavLink>
        {user?.role === 'ADMIN' && (
          <>
            <NavLink to="/admin/node-tools" className={({ isActive }) => isActive ? styles.active : ''}>
              🧰 节点工具
            </NavLink>
            <NavLink to="/admin/providers" className={({ isActive }) => isActive ? styles.active : ''}>
              🤖 模型管理
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
};
