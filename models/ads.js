const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  location: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
  dir: {
    type: String,
    required: true,
  },
  pointsTo: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});


var Ad = mongoose.model('Ad', adSchema);
module.exports = Ad;
