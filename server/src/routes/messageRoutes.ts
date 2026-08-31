import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { messageController } from '../controllers/messageController';

const router = Router();

router.use(authenticate);

router.get('/:channelId', messageController.getChannelMessages);
router.get('/thread/:messageId', messageController.getThreadReplies);
router.put('/:messageId', messageController.editMessage);
router.delete('/:messageId', messageController.deleteMessage);
router.post('/:messageId/reaction', messageController.addReaction);
router.delete('/:messageId/reaction', messageController.removeReaction);
router.post('/:messageId/pin', messageController.pinMessage);
router.get('/:channelId/pinned', messageController.getPinnedMessages);

export default router;