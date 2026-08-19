import React, { useState } from 'react';
import { workspaceApi } from '../../services/api';

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await workspaceApi.createWorkspace({ name: name.trim(), inviteCode: inviteCode.trim() || undefined });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Create Workspace</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field w-full"
              placeholder="e.g. Acme Corp"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code (optional)</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input-field w-full"
              placeholder="e.g. ACME2025"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank to auto-generate</p>
          </div>
          {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};