import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { workspaceApi } from '../services/api';
import { WorkspaceList } from '../components/WorkspaceList';
import { CreateWorkspaceModal } from '../components/modals/CreateWorkspaceModal';
import { JoinWorkspaceModal } from '../components/modals/JoinWorkspaceModal';
import { CreateChannelModal } from '../components/modals/CreateChannelModal';
import { useSocket } from '../hooks/useSocket';
import api from '../services/api';
import { Message, File as FileType } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Channel {
  id: string;
  name: string;
}

interface Member {
  _id: string;
  id?: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
}

const MarkdownLink = ({ href, children }: { href?: string; children?: React.ReactNode }) => {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
      {children}
    </a>
  );
};

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showJoinWorkspace, setShowJoinWorkspace] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [workspaceListKey, setWorkspaceListKey] = useState(0);
  const [messageInput, setMessageInput] = useState('');
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [files, setFiles] = useState<FileType[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Theme State ──────────────────────────────────────────────
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('nexus_theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('nexus_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // ─── Members State ────────────────────────────────────────────
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [membersList, setMembersList] = useState<Member[]>([]);
  const [leavingWorkspace, setLeavingWorkspace] = useState(false);

  const socketData = useSocket(user?.id || null, selectedChannelId);
  const messages = socketData.messages || [];
  const setMessages = socketData.setMessages || (() => {});
  const sendMessage = socketData.sendMessage || (() => {});
  const startTyping = socketData.startTyping || (() => {});
  const stopTyping = socketData.stopTyping || (() => {});
  const typingUsers = socketData.typingUsers || new Set();
  const onlineUsers = socketData.onlineUsers || [];
  const isConnected = socketData.isConnected || false;

  // Fetch channels
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setChannels([]);
      setSelectedChannelId(null);
      return;
    }
    const fetchChannels = async () => {
      setLoadingChannels(true);
      try {
        const res = await workspaceApi.getChannels(selectedWorkspaceId);
        setChannels(res.data);
        if (res.data.length > 0) {
          setSelectedChannelId(res.data[0].id);
        } else {
          setSelectedChannelId(null);
        }
      } catch (err) {
        console.error('Failed to fetch channels', err);
      } finally {
        setLoadingChannels(false);
      }
    };
    fetchChannels();
  }, [selectedWorkspaceId]);

  // Load messages, pinned, files
  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      setInitialMessagesLoaded(false);
      setHasMoreMessages(true);
      setPinnedMessages([]);
      setFiles([]);
      return;
    }
    const fetchData = async () => {
      try {
        const [messagesRes, pinnedRes, filesRes] = await Promise.all([
          api.get(`/messages/${selectedChannelId}?limit=50`),
          api.get(`/messages/${selectedChannelId}/pinned`),
          api.get(`/files/${selectedChannelId}`),
        ]);
        const msgs = messagesRes.data.map((msg: any) => ({
          ...msg,
          user: msg.user || { name: 'Unknown', id: msg.userId },
        }));
        msgs.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setMessages(msgs);
        setPinnedMessages(pinnedRes.data);
        setFiles(filesRes.data);
        setInitialMessagesLoaded(true);
        setHasMoreMessages(msgs.length === 50);
      } catch (error) {
        console.error('Failed to load data', error);
      }
    };
    fetchData();
  }, [selectedChannelId, setMessages]);

  // Load more messages
  const loadMoreMessages = async () => {
    if (loadingMore || !hasMoreMessages || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await api.get(`/messages/${selectedChannelId}?limit=50&before=${oldest.timestamp}`);
      const olderMessages = res.data.map((msg: any) => ({
        ...msg,
        user: msg.user || { name: 'Unknown', id: msg.userId },
      }));
      olderMessages.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
      } else {
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMoreMessages(olderMessages.length === 50);
      }
    } catch (error) {
      console.error('Failed to load more messages', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (container.scrollTop === 0 && !loadingMore && hasMoreMessages) {
      loadMoreMessages();
    }
  };

  useEffect(() => {
    if (messageContainerRef.current) {
      const container = messageContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  const handleWorkspaceSelect = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setShowMembersDropdown(false);
  };

  const onWorkspaceCreated = () => setWorkspaceListKey(prev => prev + 1);
  const onWorkspaceJoined = () => setWorkspaceListKey(prev => prev + 1);
  const onChannelCreated = () => {
    if (selectedWorkspaceId) {
      workspaceApi.getChannels(selectedWorkspaceId).then(res => setChannels(res.data));
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    sendMessage(messageInput);
    setMessageInput('');
    stopTyping();
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (e.target.value.length > 0) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannelId) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/files/${selectedChannelId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedFile = res.data;
      setFiles((prev) => [uploadedFile, ...prev]);
      const fileLink = `[📎 ${uploadedFile.originalName}](${uploadedFile.url})`;
      sendMessage(fileLink);
    } catch (error) {
      console.error('File upload failed:', error);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePin = async (messageId: string) => {
    try {
      await api.post(`/messages/${messageId}/pin`);
      const [pinnedRes, messagesRes] = await Promise.all([
        api.get(`/messages/${selectedChannelId}/pinned`),
        api.get(`/messages/${selectedChannelId}?limit=50`),
      ]);
      setPinnedMessages(pinnedRes.data);
      const msgs = messagesRes.data.map((msg: any) => ({
        ...msg,
        user: msg.user || { name: 'Unknown', id: msg.userId },
      }));
      msgs.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(msgs);
    } catch (error) {
      console.error('Pin failed:', error);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleEdit = async (messageId: string, newContent: string) => {
    // Optimistic update
    setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx !== -1) {
        const newArr = [...prev];
        newArr[idx] = { ...newArr[idx], content: newContent, editedAt: new Date().toISOString() };
        return newArr;
      }
      return prev;
    });
    try {
      await api.put(`/messages/${messageId}`, { content: newContent });
      setTimeout(async () => {
        setMessages((prev) => {
          const msg = prev.find(m => m.id === messageId);
          if (msg && msg.content === newContent) return prev;
          api.get(`/messages/${selectedChannelId}?limit=50`).then(res => {
            const msgs = res.data.map((msg: any) => ({
              ...msg,
              user: msg.user || { name: 'Unknown', id: msg.userId },
            }));
            msgs.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            setMessages(msgs);
          });
          return prev;
        });
      }, 5000);
    } catch (error) {
      console.error('Edit failed:', error);
      const res = await api.get(`/messages/${selectedChannelId}?limit=50`);
      const msgs = res.data.map((msg: any) => ({
        ...msg,
        user: msg.user || { name: 'Unknown', id: msg.userId },
      }));
      msgs.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(msgs);
    }
  };

  // ─── Members & Leave Functions ──────────────────────────────
  const fetchMembers = async () => {
    if (!selectedWorkspaceId) return;
    try {
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/members`);
      setMembersList(res.data);
      setShowMembersDropdown(true);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    }
  };

  const leaveWorkspace = async () => {
    if (!selectedWorkspaceId) return;
    if (!window.confirm('Are you sure you want to leave this workspace?')) return;
    setLeavingWorkspace(true);
    try {
      await api.post(`/workspaces/${selectedWorkspaceId}/leave`);
      setWorkspaceListKey(prev => prev + 1);
      setSelectedWorkspaceId(null);
      setSelectedChannelId(null);
      setChannels([]);
      setShowMembersDropdown(false);
    } catch (error) {
      console.error('Leave workspace failed:', error);
      alert('Failed to leave workspace.');
    } finally {
      setLeavingWorkspace(false);
    }
  };

  const removeUser = async (userId: string) => {
    if (!selectedWorkspaceId) return;
    if (!userId) {
      console.error('Cannot remove: userId is undefined');
      alert('User ID is missing.');
      return;
    }
    if (!window.confirm('Remove this user from workspace?')) return;
    try {
      await api.delete(`/workspaces/${selectedWorkspaceId}/members/${userId}`);
      fetchMembers();
    } catch (error: any) {
      console.error('Remove user failed:', error);
      const message = error.response?.data?.error || 'Failed to remove user.';
      alert(message);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const renderMessage = (msg: Message) => {
    const userName = msg.user?.name || 'Unknown';
    const isOwn = msg.userId === user?.id;
    const isPinned = msg.pinned;
    const hasReplies = msg.threadId && messages.some(m => m.threadId === msg.id);

    return (
      <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-3`}>
        <div className={`max-w-[70%] ${isOwn ? 'message-own' : 'message-other'}`}>
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <span className="font-semibold">{userName}</span>
            <span>{formatTime(msg.timestamp)}</span>
            {msg.editedAt && <span className="italic">(edited)</span>}
            {isPinned && <span className="text-yellow-400">📌</span>}
          </div>
          <div className="break-words prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
              {msg.content}
            </ReactMarkdown>
          </div>
          <div className="flex gap-2 mt-1 text-xs text-muted">
            {msg.parentId && <span className="italic">↳ Reply</span>}
            {isOwn && (
              <button
                onClick={() => {
                  const newContent = prompt('Edit message:', msg.content);
                  if (newContent) handleEdit(msg.id, newContent);
                }}
                className="hover:text-white"
              >
                Edit
              </button>
            )}
            {(isOwn || user?.role === 'admin') && (
              <button onClick={() => handleDelete(msg.id)} className="text-red-400 hover:text-red-300">
                Delete
              </button>
            )}
            {user?.role === 'admin' && (
              <button onClick={() => handlePin(msg.id)} className="hover:text-white">
                {isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-workspace text-primary">
      {/* Primary Sidebar - Workspaces */}
      <nav className="w-64 ws-sidebar flex flex-col p-3 border-r border-surface">
        <div className="flex items-center justify-between gap-2 mb-6 px-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded flex items-center justify-center bg-accent text-black">
              <i className="fas fa-shield-halved text-sm"></i>
            </div>
            <span className="font-bold text-lg ws-title">Nexus</span>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            <i className={`fas ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
            <span className="text-xs hidden sm:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-2 ws-sub">Workspaces</div>
          <WorkspaceList
            key={workspaceListKey}
            onSelectWorkspace={handleWorkspaceSelect}
            selectedWorkspaceId={selectedWorkspaceId}
          />
          <div className="mt-4 space-y-2 px-2">
            {user?.role === 'admin' && (
              <button
                className="btn btn-primary w-full justify-center text-sm py-2"
                onClick={() => setShowCreateWorkspace(true)}
              >
                <i className="fas fa-plus"></i> Create Workspace
              </button>
            )}
            <button
              className="btn btn-secondary w-full justify-center text-sm py-2"
              onClick={() => setShowJoinWorkspace(true)}
            >
              <i className="fas fa-sign-in-alt"></i> Join with Code
            </button>
          </div>
        </div>
        <div className="pt-4 mt-4 border-t border-surface">
          <div className="px-2 mb-2">
            <div className="font-semibold text-sm ws-user-name">{user?.name}</div>
            <div className="text-xs ws-user-role">{user?.role === 'admin' ? 'Admin' : 'Employee'}</div>
          </div>
          <div className="sidebar-item ws-signout" onClick={logout}>
            <i className="fas fa-sign-out-alt"></i> Sign Out
          </div>
        </div>
      </nav>

      {/* Channel Sidebar */}
      {selectedWorkspaceId ? (
        <div className="channel-sidebar ch-sidebar flex flex-col border-r border-surface">
          <div className="font-bold text-lg ch-ws-name mb-1">Channels</div>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3 ch-header">Channels</div>
          <div className="flex-1 overflow-y-auto">
            {loadingChannels ? (
              <div className="text-sm text-gray-500">Loading channels...</div>
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  className={`channel-item ${selectedChannelId === ch.id ? 'active' : ''}`}
                  onClick={() => setSelectedChannelId(ch.id)}
                >
                  <i className="fas fa-hashtag text-sm"></i> {ch.name}
                </div>
              ))
            )}
          </div>
          <div className="mt-2 space-y-1">
            <button
              className="w-full text-left text-xs ch-invite-box p-2 rounded-md border border-surface bg-opacity-10 hover:bg-opacity-20 transition"
              onClick={() => setShowCreateChannel(true)}
            >
              <i className="fas fa-plus mr-2"></i>
              Create Channel
            </button>
            <button
              className="w-full text-left text-xs ch-invite-box p-2 rounded-md border border-surface bg-opacity-10 hover:bg-opacity-20 transition"
              onClick={() => setShowPinnedMessages(!showPinnedMessages)}
            >
              <i className="fas fa-thumbtack mr-2"></i>
              Pinned Messages ({pinnedMessages.length})
            </button>
            <button
              className="w-full text-left text-xs ch-invite-box p-2 rounded-md border border-surface bg-opacity-10 hover:bg-opacity-20 transition"
              onClick={() => setShowFiles(!showFiles)}
            >
              <i className="fas fa-folder mr-2"></i>
              Files ({files.length})
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-channels text-muted">
          <div className="text-center">
            <i className="fas fa-comments text-6xl mb-4 opacity-20"></i>
            <p className="text-lg">Select or join a workspace</p>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      {selectedWorkspaceId && selectedChannelId ? (
        <div className="flex-1 flex flex-col bg-chat">
          <div className="p-4 flex justify-between items-center border-b border-surface">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-lg text-primary">
                <i className="fas fa-hashtag text-muted mr-2"></i>
                {channels.find(c => c.id === selectedChannelId)?.name || 'Channel'}
              </h2>
              <span className="text-xs text-muted">{(onlineUsers || []).length} online</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted relative">
              {isConnected ? (
                <span className="text-green-400 text-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span> Live
                </span>
              ) : (
                <span className="text-red-400 text-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span> Disconnected
                </span>
              )}
              {/* ─── Members & Leave Dropdown ─── */}
              <button
                onClick={fetchMembers}
                className="text-muted hover:text-white ml-2"
                title="Workspace members"
              >
                <i className="fas fa-users"></i>
              </button>
              {showMembersDropdown && (
                <div className="absolute right-0 top-8 mt-1 w-64 bg-gray-800 border border-surface rounded-lg shadow-lg z-50 p-3 max-h-80 overflow-y-auto">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-sm">Members</h3>
                    <button onClick={() => setShowMembersDropdown(false)} className="text-muted hover:text-white">
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  {membersList.length === 0 ? (
                    <div className="text-sm text-muted">No members</div>
                  ) : (
                    membersList.map(member => {
                      const memberId = member._id || member.id;
                      return (
                        <div key={memberId} className="flex items-center justify-between py-1 border-b border-surface last:border-0">
                          <div>
                            <div className="text-sm font-medium">{member.name}</div>
                            <div className="text-xs text-muted">{member.role}</div>
                          </div>
                          {user?.role === 'admin' && memberId !== user.id && (
                            <button
                              onClick={() => removeUser(memberId)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              <i className="fas fa-user-minus"></i>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div className="mt-3 pt-2 border-t border-surface">
                    <button
                      onClick={leaveWorkspace}
                      disabled={leavingWorkspace}
                      className="w-full btn btn-secondary text-sm py-1"
                    >
                      {leavingWorkspace ? 'Leaving...' : 'Leave Workspace'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pinned Messages */}
          {showPinnedMessages && pinnedMessages.length > 0 && (
            <div className="p-3 border-b border-surface bg-gray-800/30">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-yellow-400">📌 Pinned Messages</h3>
                <button onClick={() => setShowPinnedMessages(false)} className="text-muted hover:text-white">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              {pinnedMessages.map((msg) => (
                <div key={msg.id} className="text-sm p-2 bg-gray-700/30 rounded mb-1">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-semibold">{msg.user?.name || 'Unknown'}</span>
                    <span>{formatTime(msg.timestamp)}</span>
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* Files Panel */}
          {showFiles && files.length > 0 && (
            <div className="p-3 border-b border-surface bg-gray-800/30">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold">📁 Files</h3>
                <button onClick={() => setShowFiles(false)} className="text-muted hover:text-white">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {files.slice(0, 6).map((file) => (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="text-sm p-2 bg-gray-700/30 rounded hover:bg-gray-700/50 truncate"
                  >
                    <i className="fas fa-file mr-1"></i>
                    {file.originalName}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div
            ref={messageContainerRef}
            className="flex-1 message-list p-4 overflow-y-auto"
            onScroll={handleScroll}
          >
            {loadingMore && <div className="text-center text-muted text-sm py-2">Loading more...</div>}
            {!loadingMore && hasMoreMessages && messages.length >= 50 && (
              <div className="text-center text-muted text-sm py-2 cursor-pointer hover:underline" onClick={loadMoreMessages}>
                Load older messages
              </div>
            )}
            {messages.length === 0 && initialMessagesLoaded ? (
              <div className="text-center text-muted text-sm">No messages yet. Say hello!</div>
            ) : (
              <>
                {messages.map(renderMessage)}
                {(typingUsers || new Set()).size > 0 && (
                  <div className="typing-indicator">
                    {Array.from(typingUsers || new Set())
                      .map((id) => (onlineUsers || []).find((u) => u.id === id)?.name || 'Someone')
                      .join(', ')} is typing...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="chat-input-area p-4 border-t border-surface">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={handleTyping}
                className="input-field flex-1"
                placeholder="Type a message..."
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={!isConnected}>
                <i className="fas fa-paper-plane"></i>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || !isConnected}
              >
                <i className={`fas ${uploadingFile ? 'fa-spinner fa-spin' : 'fa-paperclip'}`}></i>
              </button>
            </form>
            {!isConnected && (
              <div className="text-xs text-red-400 mt-1">Disconnected – reconnecting...</div>
            )}
          </div>
        </div>
      ) : selectedWorkspaceId ? (
        <div className="flex-1 flex items-center justify-center bg-chat text-muted">
          <div>No channels available</div>
        </div>
      ) : null}

      {/* Modals */}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateWorkspace(false)}
          onSuccess={onWorkspaceCreated}
        />
      )}
      {showJoinWorkspace && (
        <JoinWorkspaceModal
          onClose={() => setShowJoinWorkspace(false)}
          onSuccess={onWorkspaceJoined}
        />
      )}
      {showCreateChannel && selectedWorkspaceId && (
        <CreateChannelModal
          workspaceId={selectedWorkspaceId}
          onClose={() => setShowCreateChannel(false)}
          onSuccess={onChannelCreated}
        />
      )}
    </div>
  );
};

export default Dashboard;