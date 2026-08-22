import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nexus_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

// Workspace-specific API calls
export const workspaceApi = {
  getMyWorkspaces: () => api.get('/workspaces'),
  getWorkspace: (workspaceId: string) => api.get(`/workspaces/${workspaceId}`),
  createWorkspace: (data: { name: string; inviteCode?: string }) => api.post('/workspaces', data),
  joinWorkspace: (inviteCode: string) => api.post('/workspaces/join', { inviteCode }),
  getChannels: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/channels`),
  createChannel: (workspaceId: string, name: string) =>
    api.post(`/workspaces/${workspaceId}/channels`, { name }),
};