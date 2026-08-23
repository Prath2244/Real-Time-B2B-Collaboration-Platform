// client/src/types/index.ts

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  timestamp: string;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
  // Threading
  parentId?: string;
  threadId?: string;
  // Mentions
  mentions?: string[];
  mentionEveryone?: boolean;
  mentionChannel?: boolean;
  // Pins
  pinned?: boolean;
  pinnedBy?: string;
  pinnedAt?: string;
  // Edits
  editedAt?: string;
  editHistory?: {
    content: string;
    timestamp: string;
  }[];
  // Reactions (kept for compatibility but UI may not use them)
  reactions?: {
    emoji: string;
    users: string[];
  }[];
  // Count of replies (optional, for UI)
  replyCount?: number;
}

export interface File {
  id: string;
  channelId: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
  user?: {
    id: string;
    name: string;
  };
  pinned?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'mention' | 'reply' | 'pin' | 'system';
  message: string;
  data: any;
  read: boolean;
  createdAt: string;
}

// Optional: Workspace and Channel types if needed elsewhere
export interface Workspace {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  inviteCode: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}