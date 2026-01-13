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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deleteError, setDeleteError] = useState('');

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

  const handleCreate = async () => {
    if (!title.trim()) return;
    await taskService.createTask({ title, description });
    setTitle('');
    setDescription('');
    await loadTasks();
  };

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`确定删除任务「${task.title}」吗？该任务下的版本和运行记录会被清理。`)) {
      return;
    }
    try {
      setDeleteError('');
      await taskService.deleteTask(task.id);
      await loadTasks();
    } catch (error: any) {
      setDeleteError(error?.message || '删除任务失败');
    }
  };

  return (
    <div className={styles.taskList}>
      <div className={styles.pageHeader}>
        <h1>任务列表</h1>
        <div className={styles.createForm}>
          <input
            placeholder="任务标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            placeholder="描述（可选）"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <button className={styles.btnPrimary} onClick={handleCreate}>
            创建任务
          </button>
        </div>
      </div>
      {deleteError && <div className={styles.deleteError}>{deleteError}</div>}

      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <p>还没有任务，创建第一个吧！</p>
        </div>
      ) : (
        <div className={styles.tasksGrid}>
          {tasks.map((task) => (
            <div key={task.id} className={styles.taskCard}>
              <Link to={`/tasks/${task.id}`} className={styles.taskTitle}>
                <h3>{task.title}</h3>
              </Link>
              <p className={styles.taskDesc}>{task.description || '无描述'}</p>
              <div className={styles.taskMeta}>
                <span className={`${styles.status} ${styles[`status${task.status}`]}`}>
                  {task.status}
                </span>
                <span className={styles.date}>
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className={styles.taskActions}>
                <Link to={`/tasks/${task.id}/workflow`} className={styles.linkAction}>
                  工作流
                </Link>
                <Link to={`/tasks/${task.id}`} className={styles.linkAction}>
                  详情
                </Link>
                <button className={styles.deleteAction} onClick={() => handleDelete(task)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
