import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

const NotificationSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  module: {
    type: String,
    enum: ['leave', 'expense', 'mtp', 'dcr', 'doctor', 'holiday', 'attendance', 'alert', 'hierarchy', 'secondary_sales', 'announcement'],
    required: true,
    index: true
  },
  eventId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  entityType: { type: String, default: null },
  entityId: { type: String, default: null },
  deepLink: { type: String, default: null },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  pushStatus: {
    type: String,
    enum: ['not_sent', 'queued', 'sent', 'failed', 'delivered'],
    default: 'not_sent'
  },
  pushTicketId: { type: String, default: null },
  pushError: { type: String, default: null }
}, { timestamps: true });

NotificationSchema.index({ companyId: 1, recipientId: 1, isRead: 1, createdAt: -1 });

NotificationSchema.plugin(tenantScope);

export default mongoose.model('Notification', NotificationSchema);
