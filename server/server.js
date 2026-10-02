import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';
import { startExitSyncScheduler } from './services/exitSyncService.js';

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();
    startExitSyncScheduler();
    app.listen(PORT, () => {
      console.log(`🚀 HRMS server listening on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
