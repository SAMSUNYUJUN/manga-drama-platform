/**
 * 应用主组件
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { MainLayout } from './components/Layout';
import { Login, Register } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { TaskList } from './pages/TaskList';
import { TaskDetail } from './pages/TaskDetail';
import { TaskWorkflow } from './pages/TaskWorkflow';
import { Workflows } from './pages/Workflows';
import { WorkflowDetail } from './pages/WorkflowDetail';
import { WorkflowEditor } from './pages/WorkflowEditor';
import { Prompts } from './pages/Prompts';
import { PromptDetail } from './pages/PromptDetail';
import { Assets } from './pages/Assets';
import { Trash } from './pages/Trash';
import { AdminProviders } from './pages/AdminProviders';
import { NodeTools } from './pages/NodeTools';
import './App.css';

// 受保护的路由组件
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
};

// 公开路由组件（已登录则重定向）
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 公开路由 */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />

          {/* 受保护的路由 */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <TaskList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks/:id"
            element={
              <ProtectedRoute>
                <TaskDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks/:id/workflow"
            element={
              <ProtectedRoute>
                <TaskWorkflow />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows"
            element={
              <ProtectedRoute>
                <Workflows />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/:id"
            element={
              <ProtectedRoute>
                <WorkflowDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/:id/editor"
            element={
              <ProtectedRoute>
                <WorkflowEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prompts"
            element={
              <ProtectedRoute>
                <Prompts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prompts/:id"
            element={
              <ProtectedRoute>
                <PromptDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                <Assets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trash"
            element={
              <ProtectedRoute>
                <Trash />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/providers"
            element={
              <ProtectedRoute>
                <AdminProviders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/node-tools"
            element={
              <ProtectedRoute>
                <NodeTools />
              </ProtectedRoute>
            }
          />

          {/* 默认路由 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
