/**
 * 顶部导航栏
 * @module components/Layout/Navbar
 */

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './Navbar.module.scss';

export const Navbar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarBrand}>
        <h1>漫剧生产平台</h1>
      </div>
      
      <div className={styles.navbarRight}>
        <span className={styles.userInfo}>
          欢迎, {user?.username}
        </span>
        <button onClick={handleLogout} className={styles.btnLogout}>
          退出登录
        </button>
      </div>
    </nav>
  );
};
