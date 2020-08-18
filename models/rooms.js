const mongoose = require('mongoose');

const Schema = mongoose.Schema;


// Room Schema
const roomSchema = mongoose.Schema({
  open_at: {
    type: Date,
    required: true,
  },
  max_player: {
    type: Number,
    required: true,
  },
  balance: {
    type: Number,
    default: 6000,
  },
  min_bet: {
    type: Number,
    default: 50,
  },
  max_bet: {
    type: Number,
    default: 2000,
  },
  increment_bet: {
    type: Number,
    default: 50,
  },
  winners: [
    [
      {
        type: String,
      },
    ], {
      type: Number,
    },
  ],
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  joinedPlayersId: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  gameHasStarted: {
    type: Boolean,
    default: false,
  },
});

// Export Room model
const Room = mongoose.model('Room', roomSchema);
module.exports = Room;
