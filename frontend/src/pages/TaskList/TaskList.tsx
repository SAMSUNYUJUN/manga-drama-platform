/**
 * 任务列表页面
 * @module pages/TaskList
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '@shared/types/task.types';
import { taskService } from '../../services';
import styles from './TaskList.module.scss';

export const TaskList = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await taskService.getTasks();
      setTasks(data.items);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.taskList}>
      <div className={styles.pageHeader}>
        <h1>任务列表</h1>
        <Link to="/tasks/new" className={styles.btnPrimary}>创建任务</Link>
      </div>

      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <p>还没有任务，创建第一个吧！</p>
        </div>
      ) : (
        <div className={styles.tasksGrid}>
          {tasks.map((task) => (
            <Link key={task.id} to={`/tasks/${task.id}`} className={styles.taskCard}>
              <h3>{task.title}</h3>
              <p className={styles.taskDesc}>{task.description || '无描述'}</p>
              <div className={styles.taskMeta}>
                <span className={`${styles.status} ${styles[`status${task.status}`]}`}>
                  {task.status}
                </span>
                <span className={styles.date}>
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
