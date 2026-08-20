import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message } from '../types';

export const useSocket = (userId: string | null, channelId: string | null) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string }[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const isConnected = useRef(false);

  useEffect(() => {
    if (!userId || !channelId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        isConnected.current = false;
        setSocket(null);
      }
      setMessages([]);
      setTypingUsers(new Set());
      setOnlineUsers([]);
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    const newSocket = io(socketUrl, { withCredentials: true });
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('🔌 Socket connected');
      isConnected.current = true;
      newSocket.emit('authenticate', userId);
      newSocket.emit('join-channel', channelId);
    });

    newSocket.on('new-message', (message: Message) => {
      setMessages((prev) => {
        if (prev.some(m => m.id === message.id)) return prev;
        const updated = [...prev, message];
        updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return updated;
      });
    });

    // 🔥 Listen for message updates
    newSocket.on('message-updated', (updatedMessage: Message) => {
      console.log('🔄 Client received message-updated:', updatedMessage.id);
      setMessages((prev) => {
        const idx = prev.findIndex(m => m.id === updatedMessage.id);
        if (idx !== -1) {
          const newArr = [...prev];
          // Merge the updated fields
          newArr[idx] = { ...newArr[idx], ...updatedMessage };
          // Keep sorted
          newArr.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          console.log('✅ Message updated in state');
          return newArr;
        }
        console.warn('⚠️ Message not found in state, id:', updatedMessage.id);
        return prev;
      });
    });

    newSocket.on('user-typing', ({ userId: typingUserId }: { userId: string }) => {
      setTypingUsers((prev) => new Set([...prev, typingUserId]));
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(typingUserId);
          return next;
        });
      }, 3000);
    });

    newSocket.on('user-typing-stopped', ({ userId: typingUserId }: { userId: string }) => {
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(typingUserId);
        return next;
      });
    });

    newSocket.on('channel-users', (users: { id: string; name: string }[]) => {
      setOnlineUsers(users);
    });

    newSocket.on('user-joined', ({ userId: joinedUserId }: { userId: string }) => {
      // optionally fetch users
    });

    newSocket.on('user-left', ({ userId: leftUserId }: { userId: string }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.id !== leftUserId));
    });

    newSocket.on('error', (data) => {
      console.error('Socket error:', data.message);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      isConnected.current = false;
    });

    return () => {
      if (newSocket && newSocket.connected) {
        newSocket.emit('leave-channel', channelId);
        newSocket.disconnect();
      }
      socketRef.current = null;
      isConnected.current = false;
      setSocket(null);
      setMessages([]);
      setTypingUsers(new Set());
      setOnlineUsers([]);
    };
  }, [userId, channelId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (socketRef.current && channelId && content.trim() && isConnected.current) {
        socketRef.current.emit('send-message', { channelId, content: content.trim() });
      }
    },
    [channelId]
  );

  const sendReply = useCallback(
    (parentId: string, content: string) => {
      if (socketRef.current && channelId && content.trim() && isConnected.current) {
        socketRef.current.emit('send-reply', { channelId, parentId, content: content.trim() });
      }
    },
    [channelId]
  );

  const startTyping = useCallback(() => {
    if (socketRef.current && channelId && isConnected.current) {
      socketRef.current.emit('typing-start', { channelId });
    }
  }, [channelId]);

  const stopTyping = useCallback(() => {
    if (socketRef.current && channelId && isConnected.current) {
      socketRef.current.emit('typing-stop', { channelId });
    }
  }, [channelId]);

  return {
    messages,
    setMessages,
    sendMessage,
    sendReply,
    startTyping,
    stopTyping,
    typingUsers,
    onlineUsers,
    socket,
    isConnected: isConnected.current,
  };
};