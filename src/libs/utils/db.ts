import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/be_express';
const DB_NAME = process.env.DB_NAME || 'be_express';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      // useNewUrlParser: true, // Tidak perlu di mongoose v6+
      // useUnifiedTopology: true, // Tidak perlu di mongoose v6+
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
