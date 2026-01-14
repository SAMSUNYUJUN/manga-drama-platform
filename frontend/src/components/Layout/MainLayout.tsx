/**
 * 主布局组件
 * @module components/Layout/MainLayout
 */

import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import styles from './MainLayout.module.scss';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className={styles.mainLayout}>
      <Navbar />
      <div className={styles.layoutBody}>
        <Sidebar />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
};
