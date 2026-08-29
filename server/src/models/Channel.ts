import mongoose, { Schema, Document } from 'mongoose';

export interface IChannel extends Document {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string; // userId
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
    workspaceId: { type: String, ref: 'Workspace', required: true },
    name: { type: String, required: true },
    createdBy: { type: String, ref: 'User', required: true },
  },
  {
    timestamps: true,
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

export const Channel = mongoose.model<IChannel>('Channel', ChannelSchema);