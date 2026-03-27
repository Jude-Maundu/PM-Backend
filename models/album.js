// models/Album.js
import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String,
    default: ''
  },
  coverImage: { 
    type: String,
    default: ''
  },
  price: { 
    type: Number, 
    default: 0 
  },
  photographer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  media: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media' 
  }],
  mediaCount: { 
    type: Number, 
    default: 0 
  },
  views: { 
    type: Number, 
    default: 0 
  },
  purchasedBy: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }]
}, { 
  timestamps: true 
});

// Create indexes
albumSchema.index({ photographer: 1, createdAt: -1 });
albumSchema.index({ createdAt: -1 });

const Album = mongoose.model('Album', albumSchema);
export default Album;