import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  timestamp: Date;
  // Threading
  parentId?: string; // If set, this is a reply to parent message
  threadId?: string; // ID of the root message (for easy thread grouping)
  // Mentions
  mentions?: string[]; // Array of userIds mentioned
  mentionEveryone?: boolean;
  mentionChannel?: boolean;
  // Pins
  pinned?: boolean;
  pinnedBy?: string;
  pinnedAt?: Date;
  // Edits
  editedAt?: Date;
  editHistory?: { content: string; timestamp: Date }[];
  // Reactions
  reactions?: { emoji: string; users: string[] }[];
}

const MessageSchema = new Schema<IMessage>(
  {
    channelId: { type: String, ref: 'Channel', required: true },
    userId: { type: String, ref: 'User', required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    // Threading
    parentId: { type: String, ref: 'Message' },
    threadId: { type: String, ref: 'Message' },
    // Mentions
    mentions: [{ type: String, ref: 'User' }],
    mentionEveryone: { type: Boolean, default: false },
    mentionChannel: { type: Boolean, default: false },
    // Pins
    pinned: { type: Boolean, default: false },
    pinnedBy: { type: String, ref: 'User' },
    pinnedAt: { type: Date },
    // Edits
    editedAt: { type: Date },
    editHistory: [
      {
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    // Reactions
    reactions: [
      {
        emoji: { type: String, required: true },
        users: [{ type: String, ref: 'User' }],
      },
    ],
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

export const Message = mongoose.model<IMessage>('Message', MessageSchema);