import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

let mongoConnected = false;
let storageMode: 'mongodb' | 'local-document-store' = 'local-document-store';

export async function connectDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI?.trim();

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 4000,
      });
      mongoConnected = true;
      storageMode = 'mongodb';
      console.log('[AmblyoCare DB] Connected to MongoDB via Mongoose.');
      return;
    } catch (error) {
      console.warn(
        '[AmblyoCare DB] Could not connect to MONGODB_URI; falling back to persistent local document store.',
        error instanceof Error ? error.message : error
      );
    }
  }

  // Ensure local persistent document store directory exists
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  mongoConnected = false;
  storageMode = 'local-document-store';
  console.log('[AmblyoCare DB] Using persistent local document store at ./data/amblyocare-db.json');
}

export function isMongoConnected(): boolean {
  return mongoConnected && mongoose.connection.readyState === 1;
}

export function getStorageMode(): 'mongodb' | 'local-document-store' {
  return storageMode;
}
