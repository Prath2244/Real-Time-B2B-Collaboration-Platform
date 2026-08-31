import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { fileController } from '../controllers/fileController';

const router = Router();

router.post('/:channelId', authenticate, fileController.uploadMiddleware, fileController.uploadFile);
router.get('/:channelId', authenticate, fileController.getChannelFiles);
router.delete('/:fileId', authenticate, fileController.deleteFile);

export default router;