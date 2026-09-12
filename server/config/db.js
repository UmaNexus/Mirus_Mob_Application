import mongoose from 'mongoose';

/**
 * Establish a singleton MongoDB connection using Mongoose.
 * Fails fast on startup if the database is unreachable.
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not defined in the environment');
  }

  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(uri);
  console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
};

export default connectDB;
