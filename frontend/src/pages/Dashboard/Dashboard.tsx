/**
 * 仪表板页面
 * @module pages/Dashboard
 */

import { useAuth } from '../../hooks/useAuth';
import styles from './Dashboard.module.scss';

export const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className={styles.dashboard}>
      <h1>欢迎回来, {user?.username}!</h1>
      
      <div className={styles.dashboardStats}>
        <div className={styles.statCard}>
          <h3>任务总数</h3>
          <p className={styles.statNumber}>0</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>进行中</h3>
          <p className={styles.statNumber}>0</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>已完成</h3>
          <p className={styles.statNumber}>0</p>
        </div>
      </div>

      <div className={styles.quickActions}>
        <h2>快速操作</h2>
        <button className={styles.actionBtn}>创建新任务</button>
      </div>
    </div>
  );
};
