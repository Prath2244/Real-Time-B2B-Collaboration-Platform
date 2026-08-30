import { Server as SocketServer } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { Channel } from '../models/Channel';
import { Workspace } from '../models/Workspace';
import { messageController } from '../controllers/messageController';

let ioInstance: SocketServer | null = null;

// ✅ EXPORT the emitter function
export const emitMessageUpdate = (channelId: string, updatedMessage: any) => {
  console.log('📤 emitMessageUpdate called for channel:', channelId, 'message ID:', updatedMessage.id);
  if (ioInstance) {
    const room = `channel:${channelId}`;
    console.log('📤 Broadcasting to room:', room);
    ioInstance.to(room).emit('message-updated', updatedMessage);
  } else {
    console.warn('⚠️ ioInstance is null – cannot broadcast');
  }
};

const handleSendMessage = async (
  io: SocketServer,
  userId: string,
  channelId: string,
  content: string,
  parentId?: string
) => {
  if (!content || content.trim() === '') return null;

  try {
    const channel = await Channel.findById(channelId);
    if (!channel) throw new Error('Channel not found');
    const workspace = await Workspace.findById(channel.workspaceId);
    if (!workspace || !workspace.members.includes(userId)) throw new Error('Access denied');

    let threadId: string | undefined;
    if (parentId) {
      const parentMessage = await Message.findById(parentId);
      if (parentMessage) {
        threadId = parentMessage.threadId || parentId;
      }
    }

    const message = new Message({
      channelId,
      userId,
      content: content.trim(),
      timestamp: new Date(),
      parentId: parentId || undefined,
      threadId: threadId || undefined,
    });
    await message.save();

    await messageController.invalidateMessageCache(channelId);

    const user = await User.findById(userId);
    const messageData = {
      id: message.id,
      channelId,
      userId: userId,
      content: message.content,
      timestamp: message.timestamp,
      parentId: message.parentId,
      threadId: message.threadId,
      pinned: false,
      reactions: [],
      user: user ? { id: user.id, name: user.name } : { id: userId, name: 'Unknown' },
    };

    io.to(`channel:${channelId}`).emit('new-message', messageData);
    console.log(`📤 ${parentId ? 'Reply' : 'Message'} sent by ${user?.name || 'Unknown'}`);
    return messageData;
  } catch (error) {
    console.error('Message send error:', error);
    throw error;
  }
};

export const setupSocketIO = (server: any) => {
  const io = new SocketServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  ioInstance = io; // ✅ store instance

  // Redis optional
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      console.log('🔄 Redis connected for Socket.IO');
      io.adapter(createAdapter(pubClient, subClient));
    })
    .catch(() => {
      console.warn('⚠️ Using in‑memory adapter (no Redis)');
    });

  const userSockets = new Map<string, string>();
  const channelUsers = new Map<string, Set<string>>();

  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('authenticate', async (userId: string) => {
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }
      socket.data.userId = userId;
      socket.data.userName = user.name;
      userSockets.set(userId, socket.id);
      console.log(`✅ Authenticated ${user.name}`);
    });

    socket.on('join-channel', async (channelId: string) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      try {
        const channel = await Channel.findById(channelId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }
        const workspace = await Workspace.findById(channel.workspaceId);
        if (!workspace || !workspace.members.includes(userId)) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(`channel:${channelId}`);
        if (!channelUsers.has(channelId)) {
          channelUsers.set(channelId, new Set());
        }
        channelUsers.get(channelId)!.add(userId);

        socket.to(`channel:${channelId}`).emit('user-joined', {
          userId,
          channelId,
          name: socket.data.userName,
        });

        const users = Array.from(channelUsers.get(channelId) || []);
        const userNames = await Promise.all(
          users.map(async (uid) => {
            const u = await User.findById(uid);
            return u ? { id: uid, name: u.name } : null;
          })
        );
        socket.emit('channel-users', userNames.filter(Boolean));

        console.log(`👤 ${socket.data.userName} joined channel ${channelId}`);
      } catch (error) {
        console.error('Join error:', error);
        socket.emit('error', { message: 'Failed to join channel' });
      }
    });

    socket.on('leave-channel', (channelId: string) => {
      const userId = socket.data.userId;
      if (!userId) return;
      socket.leave(`channel:${channelId}`);
      channelUsers.get(channelId)?.delete(userId);
      socket.to(`channel:${channelId}`).emit('user-left', {
        userId,
        channelId,
        name: socket.data.userName,
      });
    });

    socket.on('typing-start', ({ channelId }: { channelId: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      socket.to(`channel:${channelId}`).emit('user-typing', {
        userId,
        channelId,
        name: socket.data.userName,
      });
    });

    socket.on('typing-stop', ({ channelId }: { channelId: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      socket.to(`channel:${channelId}`).emit('user-typing-stopped', { userId, channelId });
    });

    socket.on('send-message', async ({ channelId, content, parentId }: {
      channelId: string;
      content: string;
      parentId?: string;
    }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      try {
        await handleSendMessage(io, userId, channelId, content, parentId);
      } catch (err: any) {
        socket.emit('error', { message: err.message || 'Failed to send' });
      }
    });

    socket.on('send-reply', async ({ channelId, parentId, content }: {
      channelId: string;
      parentId: string;
      content: string;
    }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      try {
        await handleSendMessage(io, userId, channelId, content, parentId);
      } catch (err: any) {
        socket.emit('error', { message: err.message || 'Failed to send reply' });
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      const userName = socket.data.userName || 'Unknown';
      if (userId) {
        userSockets.delete(userId);
        for (const [channelId, users] of channelUsers) {
          if (users.delete(userId)) {
            socket.to(`channel:${channelId}`).emit('user-left', {
              userId,
              channelId,
              name: userName,
            });
          }
        }
      }
      console.log(`🔌 ${userName} disconnected`);
    });

    socket.on('ping', () => socket.emit('pong'));
  });

  console.log('✅ Socket.IO server ready');
  return io;
};