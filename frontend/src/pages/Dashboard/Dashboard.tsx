/**
 * 仪表板页面
 * @module pages/Dashboard
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { taskService } from '../../services';
import type { TaskStats } from '../../services/task.service';
import styles from './Dashboard.module.scss';

export const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<TaskStats>({ total: 0, processing: 0, completed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await taskService.getTaskStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to load task stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    // 每 10 秒刷新一次
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.dashboard}>
      <h1>欢迎回来, {user?.username}!</h1>
      
      <div className={styles.dashboardStats}>
        <div className={styles.statCard}>
          <h3>任务总数</h3>
          <p className={styles.statNumber}>{loading ? '-' : stats.total}</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>进行中</h3>
          <p className={styles.statNumber}>{loading ? '-' : stats.processing}</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>已完成</h3>
          <p className={styles.statNumber}>{loading ? '-' : stats.completed}</p>
        </div>
      </div>

      <div className={styles.quickActions}>
        <h2>快速操作</h2>
        <Link to="/tasks" className={styles.actionBtn}>查看任务列表</Link>
      </div>
    </div>
  );
};
