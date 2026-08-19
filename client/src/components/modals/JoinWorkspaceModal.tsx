import React, { useState } from 'react';
import { workspaceApi } from '../../services/api';

interface JoinWorkspaceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const JoinWorkspaceModal: React.FC<JoinWorkspaceModalProps> = ({ onClose, onSuccess }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await workspaceApi.joinWorkspace(inviteCode.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Join Workspace</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input-field w-full"
              placeholder="e.g. ACME2025"
              required
            />
          </div>
          {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};