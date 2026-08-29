import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  id: string;
  userId: string;
  type: 'mention' | 'reply' | 'pin' | 'system';
  message: string;
  data: any;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: String, ref: 'User', required: true },
    type: { type: String, enum: ['mention', 'reply', 'pin', 'system'], required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
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

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);