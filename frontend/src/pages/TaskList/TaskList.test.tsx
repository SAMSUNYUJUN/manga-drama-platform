import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskList } from './TaskList';
import { vi } from 'vitest';

vi.mock('../../services', () => ({
  taskService: {
    getTasks: vi.fn().mockResolvedValue({ items: [] }),
    createTask: vi.fn().mockResolvedValue({ id: 1 }),
  },
}));

describe('TaskList', () => {
  it('renders empty state', async () => {
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>,
    );
    expect(await screen.findByText('还没有任务，创建第一个吧！')).toBeInTheDocument();
  });
});
