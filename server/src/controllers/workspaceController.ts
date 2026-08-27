import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Workspace } from '../models/Workspace';
import { Channel } from '../models/Channel';
import { generateId } from '../utils/helpers';
import { cache } from '../config/redis';
import { User } from '../models/User';

const WORKSPACE_CACHE_TTL = 120;

export const workspaceController = {
  // ─── Create Workspace ──────────────────────────────────────
  create: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { name, inviteCode } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Workspace name is required' });
      }

      const code = inviteCode ? inviteCode.toUpperCase() : generateId().slice(0, 6).toUpperCase();
      const existing = await Workspace.findOne({ inviteCode: code });
      if (existing) {
        return res.status(400).json({ error: 'Invite code already in use' });
      }

      const workspace = new Workspace({
        name,
        createdBy: userId,
        members: [userId],
        inviteCode: code,
      });
      await workspace.save();

      // Create default channel
      const channel = new Channel({
        workspaceId: workspace.id,
        name: 'general',
        createdBy: userId,
      });
      await channel.save();

      await cache.del(`workspaces:user:${userId}`);
      res.status(201).json(workspace);
    } catch (error) {
      console.error('Create workspace error:', error);
      res.status(500).json({ error: 'Failed to create workspace' });
    }
  },

  // ─── Join Workspace ──────────────────────────────────────
  join: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { inviteCode } = req.body;
      if (!inviteCode) {
        return res.status(400).json({ error: 'Invite code is required' });
      }

      const workspace = await Workspace.findOne({ inviteCode: inviteCode.toUpperCase() });
      if (!workspace) {
        return res.status(404).json({ error: 'Invalid invite code' });
      }

      if (!workspace.members.includes(userId)) {
        workspace.members.push(userId);
        await workspace.save();
        await cache.del(`workspaces:user:${userId}`);
      }

      res.json(workspace);
    } catch (error) {
      console.error('Join workspace error:', error);
      res.status(500).json({ error: 'Failed to join workspace' });
    }
  },

  // ─── Get all workspaces for current user ──────────────────
  getUserWorkspaces: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const cacheKey = `workspaces:user:${userId}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) return res.json(cached);

      const workspaces = await Workspace.find({ members: userId });
      await cache.set(cacheKey, workspaces, WORKSPACE_CACHE_TTL);
      res.json(workspaces);
    } catch (error) {
      console.error('Get workspaces error:', error);
      res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
  },

  // ─── Get a single workspace with channels ──────────────────
  getWorkspaceById: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { workspaceId } = req.params;
      const cacheKey = `workspace:${workspaceId}:user:${userId}`;
      const cached = await cache.get<any>(cacheKey);
      if (cached) return res.json(cached);

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
      if (!workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const channels = await Channel.find({ workspaceId });
      const result = { workspace, channels };
      await cache.set(cacheKey, result, WORKSPACE_CACHE_TTL);
      res.json(result);
    } catch (error) {
      console.error('Get workspace error:', error);
      res.status(500).json({ error: 'Failed to fetch workspace' });
    }
  },

  // ─── Create a channel ──────────────────────────────────────
  createChannel: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { workspaceId } = req.params;
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Channel name is required' });
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
      if (!workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'You are not a member of this workspace' });
      }

      const channel = new Channel({
        workspaceId,
        name,
        createdBy: userId,
      });
      await channel.save();

      await cache.del(`workspace:${workspaceId}:user:${userId}`);
      res.status(201).json(channel);
    } catch (error) {
      console.error('Create channel error:', error);
      res.status(500).json({ error: 'Failed to create channel' });
    }
  },

  // ─── Get channels of a workspace ──────────────────────────
  getChannels: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    try {
      const { workspaceId } = req.params;
      const cacheKey = `channels:${workspaceId}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) return res.json(cached);

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
      if (!workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const channels = await Channel.find({ workspaceId });
      await cache.set(cacheKey, channels, WORKSPACE_CACHE_TTL);
      res.json(channels);
    } catch (error) {
      console.error('Get channels error:', error);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  },

  // ─── Get workspace members ────────────────────────────────
  getWorkspaceMembers: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    const { workspaceId } = req.params;
    try {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
      if (!workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'You are not a member of this workspace' });
      }
      const members = await User.find({ _id: { $in: workspace.members } }).select('name email role');
      res.json(members);
    } catch (error) {
      console.error('Get members error:', error);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  },

  // ─── Leave workspace ──────────────────────────────────────
  leaveWorkspace: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    const { workspaceId } = req.params;
    try {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
      if (!workspace.members.includes(userId)) {
        return res.status(403).json({ error: 'You are not a member of this workspace' });
      }
      workspace.members = workspace.members.filter(id => id !== userId);
      await workspace.save();
      await cache.del(`workspaces:user:${userId}`);
      await cache.del(`workspace:${workspaceId}:user:${userId}`);
      res.json({ success: true, message: 'Left workspace' });
    } catch (error) {
      console.error('Leave workspace error:', error);
      res.status(500).json({ error: 'Failed to leave workspace' });
    }
  },

  // ─── Admin remove user from workspace ──────────────────────
  removeUserFromWorkspace: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const adminUserId = req.user.id;
    const { workspaceId, userId } = req.params;

    console.log(`🔍 Removing user ${userId} from workspace ${workspaceId} by admin ${adminUserId}`);

    try {
      // 1. Find the workspace
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        console.error('❌ Workspace not found:', workspaceId);
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // 2. Check permissions
      const currentUser = await User.findById(adminUserId);
      if (currentUser?.role !== 'admin' && workspace.createdBy !== adminUserId) {
        console.error('❌ Permission denied for admin:', adminUserId);
        return res.status(403).json({ error: 'Only admins or workspace owners can remove members' });
      }

      // 3. Cannot remove yourself
      if (userId === adminUserId) {
        console.error('❌ Cannot remove self');
        return res.status(400).json({ error: 'You cannot remove yourself, use leave instead' });
      }

      // 4. Check if user is a member
      const memberIds = workspace.members.map(id => id.toString());
      const targetUserId = userId.toString();
      console.log(`📋 Current members: [${memberIds.join(', ')}]`);
      console.log(`🎯 Target userId: ${targetUserId}`);

      if (!memberIds.includes(targetUserId)) {
        console.error(`❌ User ${targetUserId} is not a member`);
        return res.status(404).json({ error: 'User is not a member' });
      }

      // 5. Remove the user using $pull (MongoDB update)
      await Workspace.updateOne(
        { _id: workspaceId },
        { $pull: { members: targetUserId } }
      );

      // 6. Invalidate caches
      await cache.del(`workspaces:user:${targetUserId}`);
      await cache.del(`workspace:${workspaceId}:user:${targetUserId}`);
      await cache.del(`workspaces:user:${adminUserId}`);

      console.log(`✅ User ${targetUserId} removed successfully`);
      res.json({ success: true, message: 'User removed' });
    } catch (error) {
      console.error('❌ Remove user error:', error);
      res.status(500).json({ error: 'Failed to remove user: ' + (error as any).message });
    }
  },
};