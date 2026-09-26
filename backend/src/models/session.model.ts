import type { ObjectId } from 'mongodb';

export interface Session {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  usedHashes: string[];
  expiresAt: Date;
  createdAt: Date;
  revoked: boolean;
  tokenVersion: number;
}
