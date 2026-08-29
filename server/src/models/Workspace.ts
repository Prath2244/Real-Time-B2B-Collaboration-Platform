import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkspace extends Document {
  id: string;
  name: string;
  createdBy: string; // userId
  members: string[]; // array of userIds
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true },
    createdBy: { type: String, ref: 'User', required: true },
    members: [{ type: String, ref: 'User' }],
    inviteCode: { type: String, required: true, unique: true },
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

export const Workspace = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);