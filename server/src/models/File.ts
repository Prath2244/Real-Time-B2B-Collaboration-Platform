import mongoose, { Schema, Document } from 'mongoose';

export interface IFile extends Document {
  id: string;
  channelId: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: Date;
  pinned?: boolean;
}

const FileSchema = new Schema<IFile>(
  {
    channelId: { type: String, ref: 'Channel', required: true },
    userId: { type: String, ref: 'User', required: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    pinned: { type: Boolean, default: false },
  },
  {
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

export const File = mongoose.model<IFile>('File', FileSchema);