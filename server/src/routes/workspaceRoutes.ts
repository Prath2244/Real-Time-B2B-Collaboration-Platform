import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceController } from '../controllers/workspaceController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Specific routes (must come before generic :workspaceId) ───

// Get workspace members
router.get('/:workspaceId/members', workspaceController.getWorkspaceMembers);

// Leave workspace
router.post('/:workspaceId/leave', workspaceController.leaveWorkspace);

// Remove user from workspace (admin only)
router.delete('/:workspaceId/members/:userId', workspaceController.removeUserFromWorkspace);

// Get channels of a workspace
router.get('/:workspaceId/channels', workspaceController.getChannels);

// Create a channel in a workspace
router.post('/:workspaceId/channels', workspaceController.createChannel);

// ─── Generic workspace routes (must come last) ───

// Get a single workspace with channels
router.get('/:workspaceId', workspaceController.getWorkspaceById);

// ─── Top-level workspace routes ───

// Create workspace
router.post('/', workspaceController.create);

// Join workspace with invite code
router.post('/join', workspaceController.join);

// Get all workspaces for current user
router.get('/', workspaceController.getUserWorkspaces);

export default router;