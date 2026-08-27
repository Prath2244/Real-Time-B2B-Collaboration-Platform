import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Message } from '../models/Message';
import { Channel } from '../models/Channel';
import { Workspace } from '../models/Workspace';
import { cache } from '../config/redis';
import { emitMessageUpdate } from '../sockets';

const MESSAGE_CACHE_TTL = 30;
const MESSAGES_PER_PAGE = 50;

// Helper to extract user data from populated field
const extractUser = (userObj: any) => {
  if (!userObj) return { id: 'unknown', name: 'Unknown' };
  if (typeof userObj === 'string') return { id: userObj, name: 'Unknown' };
  return {
    id: userObj._id?.toString() || userObj.toString(),
    name: userObj.name || 'Unknown',
  };
};

export const messageController = {
  getChannelMessages: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { channelId } = req.params;
      const { limit = MESSAGES_PER_PAGE, before, threadId } = req.query;

      const channel = await Channel.findById(channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });

      const workspace = await Workspace.findById(channel.workspaceId);
      if (!workspace || !workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const cacheKey = before
        ? `messages:${channelId}:before:${before}${threadId ? `:thread:${threadId}` : ''}`
        : `messages:${channelId}:latest${threadId ? `:thread:${threadId}` : ''}`;

      if (!before && !threadId) {
        const cached = await cache.get<any[]>(cacheKey);
        if (cached) {
          const enhanced = cached.map((msg: any) => ({
            ...msg,
            user: msg.user || { id: msg.userId, name: 'Unknown' },
          }));
          return res.json(enhanced);
        }
      }

      const query: any = { channelId };
      if (before) {
        query.timestamp = { $lt: new Date(before as string) };
      }
      if (threadId) {
        query.$or = [{ threadId }, { id: threadId }];
      }

      const messages = await Message.find(query)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .populate('userId', 'name email')
        .lean();

      const result = messages.map((msg: any) => {
        const userInfo = extractUser(msg.userId);
        return {
          ...msg,
          id: msg._id.toString(),
          userId: userInfo.id,
          user: userInfo,
          timestamp: msg.timestamp,
          pinned: msg.pinned || false,
          reactions: msg.reactions || [],
          editHistory: msg.editHistory || [],
        };
      });

      if (!before && !threadId && result.length > 0) {
        await cache.set(cacheKey, result, MESSAGE_CACHE_TTL);
      }

      res.json(result);
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  },

  getThreadReplies: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { messageId } = req.params;
      const replies = await Message.find({ threadId: messageId })
        .sort({ timestamp: 1 })
        .populate('userId', 'name email')
        .lean();

      const result = replies.map((msg: any) => {
        const userInfo = extractUser(msg.userId);
        return {
          ...msg,
          id: msg._id.toString(),
          userId: userInfo.id,
          user: userInfo,
          timestamp: msg.timestamp,
        };
      });

      res.json(result);
    } catch (error) {
      console.error('Get thread replies error:', error);
      res.status(500).json({ error: 'Failed to fetch thread replies' });
    }
  },

  // ⭐ EDIT MESSAGE – with socket broadcast and logs
  editMessage: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { messageId } = req.params;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const message = await Message.findById(messageId);
      if (!message) return res.status(404).json({ error: 'Message not found' });

      if (message.userId !== userId) {
        return res.status(403).json({ error: 'You can only edit your own messages' });
      }

      // Save edit history
      if (!message.editHistory) message.editHistory = [];
      message.editHistory.push({
        content: message.content,
        timestamp: new Date(),
      });

      message.content = content.trim();
      message.editedAt = new Date();
      await message.save();

      console.log('✅ Message edited in DB:', messageId);

      // Invalidate cache
      await cache.delPattern(`messages:${message.channelId}:*`);

      // ─── Broadcast update via Socket.IO ───
      const updated = await Message.findById(messageId).populate('userId', 'name email').lean();
      if (updated) {
        const userInfo = extractUser((updated as any).userId);
        const messageData = {
          ...updated,
          id: (updated as any)._id.toString(),
          userId: userInfo.id,
          user: userInfo,
          timestamp: (updated as any).timestamp,
          pinned: (updated as any).pinned || false,
          reactions: (updated as any).reactions || [],
          editHistory: (updated as any).editHistory || [],
        };
        console.log('📡 Emitting update for channel:', message.channelId);
        emitMessageUpdate(message.channelId, messageData);
      } else {
        console.warn('⚠️ Updated message not found after edit');
      }

      res.json(message);
    } catch (error) {
      console.error('Edit message error:', error);
      res.status(500).json({ error: 'Failed to edit message' });
    }
  },

  deleteMessage: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { messageId } = req.params;
      const message = await Message.findById(messageId);
      if (!message) return res.status(404).json({ error: 'Message not found' });

      if (message.userId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only delete your own messages' });
      }

      if (!message.parentId) {
        await Message.deleteMany({ threadId: messageId });
      }
      await message.deleteOne();
      await cache.delPattern(`messages:${message.channelId}:*`);
      res.json({ success: true, messageId });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  },

  addReaction: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

      const message = await Message.findById(messageId);
      if (!message) return res.status(404).json({ error: 'Message not found' });

      if (!message.reactions) message.reactions = [];
      let reaction = message.reactions.find((r: any) => r.emoji === emoji);
      if (!reaction) {
        reaction = { emoji, users: [] };
        message.reactions.push(reaction);
      }
      if (!reaction.users.includes(userId)) {
        reaction.users.push(userId);
      }
      await message.save();
      res.json(message);
    } catch (error) {
      console.error('Add reaction error:', error);
      res.status(500).json({ error: 'Failed to add reaction' });
    }
  },

  removeReaction: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;
      const message = await Message.findById(messageId);
      if (!message) return res.status(404).json({ error: 'Message not found' });

      if (!message.reactions) message.reactions = [];
      const reaction = message.reactions.find((r: any) => r.emoji === emoji);
      if (reaction) {
        reaction.users = reaction.users.filter((id: string) => id !== userId);
        if (reaction.users.length === 0) {
          message.reactions = message.reactions.filter((r: any) => r.emoji !== emoji);
        }
      }
      await message.save();
      res.json(message);
    } catch (error) {
      console.error('Remove reaction error:', error);
      res.status(500).json({ error: 'Failed to remove reaction' });
    }
  },

  pinMessage: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    try {
      const { messageId } = req.params;
      const message = await Message.findById(messageId);
      if (!message) return res.status(404).json({ error: 'Message not found' });

      const channel = await Channel.findById(message.channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      const workspace = await Workspace.findById(channel.workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

      if (req.user.role !== 'admin' && workspace.createdBy !== userId) {
        return res.status(403).json({ error: 'Only admins and workspace owners can pin messages' });
      }

      message.pinned = !message.pinned;
      if (message.pinned) {
        message.pinnedBy = userId;
        message.pinnedAt = new Date();
      } else {
        message.pinnedBy = undefined;
        message.pinnedAt = undefined;
      }
      await message.save();
      await cache.delPattern(`messages:${message.channelId}:*`);
      res.json(message);
    } catch (error) {
      console.error('Pin message error:', error);
      res.status(500).json({ error: 'Failed to pin message' });
    }
  },

  getPinnedMessages: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    try {
      const { channelId } = req.params;
      const channel = await Channel.findById(channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      const workspace = await Workspace.findById(channel.workspaceId);
      if (!workspace || !workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const pinnedMessages = await Message.find({ channelId, pinned: true })
        .sort({ pinnedAt: -1 })
        .populate('userId', 'name email')
        .populate('pinnedBy', 'name email')
        .lean();

      const result = pinnedMessages.map((msg: any) => {
        const userInfo = extractUser(msg.userId);
        const pinnedByInfo = extractUser(msg.pinnedBy);
        return {
          ...msg,
          id: msg._id.toString(),
          userId: userInfo.id,
          user: userInfo,
          pinnedBy: pinnedByInfo,
          timestamp: msg.timestamp,
        };
      });
      res.json(result);
    } catch (error) {
      console.error('Get pinned messages error:', error);
      res.status(500).json({ error: 'Failed to fetch pinned messages' });
    }
  },

  invalidateMessageCache: async (channelId: string) => {
    await cache.delPattern(`messages:${channelId}:*`);
    console.log(`🗑️ Invalidated cache for channel: ${channelId}`);
  },
};