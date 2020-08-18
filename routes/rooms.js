const express = require('express');
const Rooms = require('../models/rooms');
const Users = require('../models/users');
const Ads = require('../models/ads');

const router = express.Router();

function isLoggedIn(req, res, next) {
  // if user is authenticated in the session, carry on
  if (req.isAuthenticated()) {
    return next();
  }
  // if they aren't redirect them to the home page
  res.redirect('/');
}

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

function isAdmin(req, res, next) {
// if user is authenticated in the session, carry on
  if (req.isAuthenticated()) {
    // if user is admin, carry on
    if (req.user.admin) {
      return next();
    }
    res.redirect('/');
  }
  // if they aren't redirect them to the home page
  res.redirect('/');
}

// Index
// GET request for all rooms
router.get('/', isLoggedIn, async (req, res) => {
  let rooms = await Rooms.find({ open_at: { $gt: new Date() } }).sort({ open_at: 1 });
  let ads_vert = await Ads.find({
    location: "list_rooms_vertical"
  });
  let ads_hori = await Ads.find({
    location: "list_rooms_horizontal"
  });



  res.render('list_rooms', {
    title: 'Salles de blackjack',
    rooms,
    ads_hori,
    ads_vert
  });

});

// Show
// GET request for a room
router.get('/:id', isLoggedIn, async (req, res) => {
  res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  Rooms.findById(req.params.id, async (err, room) => {
    if (err) throw err;
    if (!(room.gameHasStarted)) {
      if (room.joinedPlayersId.length < room.max_player || req.user.joinedRoom == room._id) {
        if (req.user.joinedRoom === null || req.user.joinedRoom === '') {
          Users.update({ _id: req.user._id }, { $set: { joinedRoom: room._id } }).exec();
          Rooms.update({ _id: room._id }, { $push: { joinedPlayersId: req.user._id } }).exec();
        }

        let ads_hori = await Ads.find({
          location: "room_horizontal"
        });

        res.render('room', { room, title: 'Salle de jeu', user: req.user, ads_hori });
      } else {
        req.flash('error', 'La salle est remplie, veuillez essayer une autre');
        res.redirect('/rooms');
      }
    } else {
      req.flash('error', 'La partie correspondant à cette salle a déjà commencée ou terminée !');
      res.redirect('/rooms');
    }
  });
});

// Leave
// GET request to leave a room
router.get('/leave/:id', isLoggedIn, (req, res) => {
  if (req.user.joinedRoom === req.params.id) {
    Rooms.findById({ _id: req.params.id }, (err) => {
      if (err) throw err;
      Rooms.updateOne({ _id: req.params.id }, { $pull: { joinedPlayersId: req.user.id } }).exec();
      Users.update({ _id: req.user._id }, { $set: { joinedRoom: null } }, {}, () => {
        res.redirect('/rooms');
      });
    });
  } else {
    res.redirect('/rooms');
  }
});


module.exports = router;
