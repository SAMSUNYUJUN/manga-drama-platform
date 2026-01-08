/**
 * 任务详情页面
 * @module pages/TaskDetail
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { TaskDetail as TaskDetailType } from '@shared/types/task.types';
import { taskService } from '../../services';
import styles from './TaskDetail.module.scss';

export const TaskDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadTask(parseInt(id));
    }
  }, [id]);

  const loadTask = async (taskId: number) => {
    try {
      const data = await taskService.getTask(taskId);
      setTask(data);
    } catch (error) {
      console.error('Failed to load task:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (!task) {
    return <div className={styles.error}>任务不存在</div>;
  }

  return (
    <div className={styles.taskDetail}>
      <div className={styles.detailHeader}>
        <button onClick={() => navigate('/tasks')} className={styles.btnBack}>
          ← 返回列表
        </button>
        <h1>{task.title}</h1>
      </div>

      <div className={styles.detailContent}>
        <div className={styles.infoSection}>
          <h2>基本信息</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>状态</label>
              <span className={`${styles.status} ${styles[`status${task.status}`]}`}>
                {task.status}
              </span>
            </div>
            <div className={styles.infoItem}>
              <label>当前阶段</label>
              <span>{task.stage || '未开始'}</span>
            </div>
            <div className={styles.infoItem}>
              <label>创建时间</label>
              <span>{new Date(task.createdAt).toLocaleString()}</span>
            </div>
            <div className={styles.infoItem}>
              <label>更新时间</label>
              <span>{new Date(task.updatedAt).toLocaleString()}</span>
            </div>
          </div>
          {task.description && (
            <div className={styles.description}>
              <label>描述</label>
              <p>{task.description}</p>
            </div>
          )}
        </div>

        <div className={styles.versionsSection}>
          <h2>版本历史</h2>
          <div className={styles.versionsList}>
            {task.versions?.map((version) => (
              <div key={version.id} className={styles.versionItem}>
                <span className={styles.versionNumber}>v{version.version}</span>
                <span className={styles.versionStage}>{version.stage}</span>
                <span className={styles.versionDate}>
                  {new Date(version.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
