import React, { useEffect, useState } from 'react';
import { workspaceApi } from '../services/api';

interface Workspace {
  id: string;
  name: string;
  inviteCode: string;
  members: string[];
}

interface WorkspaceListProps {
  onSelectWorkspace: (workspaceId: string) => void;
  selectedWorkspaceId?: string | null;
}

export const WorkspaceList: React.FC<WorkspaceListProps> = ({ onSelectWorkspace, selectedWorkspaceId }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchWorkspaces = async () => {
    try {
      const res = await workspaceApi.getMyWorkspaces();
      setWorkspaces(res.data);
    } catch (err) {
      setError('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  if (loading) return <div className="text-sm text-gray-500 dark:text-gray-400">Loading workspaces...</div>;
  if (error) return <div className="text-sm text-red-500">{error}</div>;

  return (
    <div className="space-y-1">
      {workspaces.map((ws) => (
        <div
          key={ws.id}
          onClick={() => onSelectWorkspace(ws.id)}
          className={`sidebar-item ${selectedWorkspaceId === ws.id ? 'active' : ''}`}
          style={{ cursor: 'pointer' }}
        >
          <i className="fas fa-layer-group w-5 text-center"></i>
          <span>{ws.name}</span>
        </div>
      ))}
      {workspaces.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 px-2 py-1">No workspaces yet</div>
      )}
    </div>
  );
};