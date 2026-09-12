import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Ensure required env exists before app/util modules read it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.NODE_ENV = 'test';

let mongod;

/** Spin up an isolated in-memory MongoDB and connect Mongoose to it. */
export const connect = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

/** Drop all data between tests for isolation. */
export const clear = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

/** Tear down the connection and the in-memory server. */
export const close = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};
