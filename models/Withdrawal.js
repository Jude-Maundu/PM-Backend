import mongoose from 'mongoose';

const { Schema } = mongoose;

const withdrawalSchema = new Schema({
  photographer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1000 // Minimum withdrawal amount
  },
  method: {
    type: String,
    enum: ['mpesa', 'bank'],
    required: true
  },
  // M-Pesa details
  phoneNumber: {
    type: String,
    required: function() { return this.method === 'mpesa'; }
  },
  // Bank details
  accountName: {
    type: String,
    required: function() { return this.method === 'bank'; }
  },
  accountNumber: {
    type: String,
    required: function() { return this.method === 'bank'; }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  reference: {
    type: String,
    unique: true
  },
  processedAt: Date,
  notes: String
}, {
  timestamps: true
});

// Generate reference before saving
withdrawalSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = `WD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  next();
});

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

export default Withdrawal;