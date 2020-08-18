const moment = require('moment');
const Room = require('../models/rooms');
const User = require('../models/users');
const Agenda = require('agenda');
const mongoose = require('mongoose');
const config = require('../config/database');

// Create
exports.create = (req, res) => {
  const openAt = moment(`${req.body.date} ${req.body.time}`, 'YYYY-MM-DD HH:mm'); // Merge the date and the time to get a DateTime object

  const room = new Room({
    open_at: openAt,
    max_player: req.body.max_player,
    balance: req.body.balance,
    min_bet: req.body.min_bet,
    max_bet: req.body.max_bet,
    increment_bet: req.body.increment_bet,
  });

  room.save((err, room) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }

    // Add event to the agenda to start the game at the date provided
    const agenda = new Agenda({ db: { address: config.database, collection: 'schedules' } });
    agenda.on('ready', () => {
      const ms = moment(new Date()).diff(moment(`${req.body.date} ${req.body.time}`, 'YYYY-MM-DD HH:mm'));

      agenda.schedule(new Date(Date.now() - ms), 'start', {
        id: room.id,
      });
      agenda.start();
    });

    req.flash('success', 'Salle créée !');
    res.redirect('/admin/rooms/');
  });
};

// Index all
exports.index = null;

// Show one
exports.show = null;

// Update
exports.update = (req, res) => {
  const room = {};
  room.open_at = moment(`${req.body.date} ${req.body.time}`, 'YYYY-MM-DD HH:mm'); // Merge the date and the time to get a DateTime object
  room.max_player = req.body.max_player;
  room.balance = req.body.balance;
  room.min_bet = req.body.min_bet;
  room.max_bet = req.body.max_bet;
  room.increment_bet = req.body.increment_bet;
  room.updated_at = moment();

  // Update the date of the schedule
  const schedules = mongoose.connection.collection('schedules');

  const agendaQuery = { 'data.id': req.params.id };

  schedules.update(agendaQuery, {
    $set: {
      nextRunAt: moment(`${req.body.date} ${req.body.time}`, 'YYYY-MM-DD HH:mm').toDate(),
    },
  }, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
  });

  // Update the room informations
  const query = { _id: req.params.id };

  Room.update(query, room, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
    req.flash('success', `Salle #${req.params.id} mise à jour !`);
    res.redirect('/admin/rooms/');
  });
};

// Delete
exports.delete = (req, res) => {
  // Remove users from the room (if they are registered to the room)
  const usersQuery = { joinedRoom: req.params.id };

  User.update(usersQuery, {
    $set: {
      joinedRoom: null,
    },
  }, {
    multi: true,
  }, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
  });


  // Remove the schedule
  const schedules = mongoose.connection.collection('schedules');

  const agendaQuery = { 'data.id': req.params.id };

  schedules.remove(agendaQuery, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
  });

  // Remove the room
  const roomQuery = { _id: req.params.id };
  Room.remove(roomQuery, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
    req.flash('success', `Salle #${req.params.id} supprimée !`);
    res.send('Successfully deleted!');
  });
};
