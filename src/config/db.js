import mongoose from 'mongoose';
import { env } from './env.js';

// Reuse connection across serverless invocations (Vercel cold-start safe).
let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
  });
  isConnected = true;
  console.log('MongoDB connected');
}
