/**
 * 侧边导航栏
 * @module components/Layout/Sidebar
 */

import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.scss';

export const Sidebar = () => {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.sidebarNav}>
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>
          📊 仪表板
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => isActive ? styles.active : ''}>
          📋 任务列表
        </NavLink>
        <NavLink to="/assets" className={({ isActive }) => isActive ? styles.active : ''}>
          🎨 资产管理
        </NavLink>
      </nav>
    </aside>
  );
};
