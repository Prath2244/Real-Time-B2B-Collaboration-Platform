import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { File } from '../models/File';
import { Channel } from '../models/Channel';
import { Workspace } from '../models/Workspace';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const fileController = {
  uploadMiddleware: upload.single('file'),

  uploadFile: async (req: AuthRequest & { file?: any }, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const { channelId } = req.params;
      const channel = await Channel.findById(channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      const workspace = await Workspace.findById(channel.workspaceId);
      if (!workspace || !workspace.members.includes(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const fileData = new File({
        channelId,
        userId: req.user.id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`, // relative
      });
      await fileData.save();

      res.status(201).json(fileData);
    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  },

  getChannelFiles: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { channelId } = req.params;
      const channel = await Channel.findById(channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      const workspace = await Workspace.findById(channel.workspaceId);
      if (!workspace || !workspace.members.includes(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const files = await File.find({ channelId })
        .sort({ uploadedAt: -1 })
        .populate('userId', 'name email')
        .lean();
      res.json(files);
    } catch (error) {
      console.error('Get files error:', error);
      res.status(500).json({ error: 'Failed to fetch files' });
    }
  },

  deleteFile: async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { fileId } = req.params;
      const file = await File.findById(fileId);
      if (!file) return res.status(404).json({ error: 'File not found' });
      const channel = await Channel.findById(file.channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      const workspace = await Workspace.findById(channel.workspaceId);
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

      if (file.userId !== req.user.id && req.user.role !== 'admin' && workspace.createdBy !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const filePath = path.join(__dirname, '../../uploads', file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await file.deleteOne();
      res.json({ success: true });
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  },
};