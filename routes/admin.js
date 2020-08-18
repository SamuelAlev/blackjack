const express = require('express');
const pm2 = require('pm2');
const Rooms = require('../models/rooms');
const Users = require('../models/users');
const Ads = require('../models/ads');
const sys = require('sys');
const exec = require('child_process').exec;
const multer = require("multer");
const upload = multer({
  dest: './public/uploads/'
});

// Required controller modules
const roomsController = require('../controllers/roomsController');
const usersController = require('../controllers/usersController');
const adsController = require('../controllers/adsController');

const router = express.Router();


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
// GET request for admin index page
router.get('/', isAdmin, (req, res) => {
  res.render('admin_index', { title: 'Panel administrateur' });
});

/**
 * Users management
 */

// Index
// GET request for all users page management
router.get('/users', isAdmin, (req, res) => {
  Users.find({}).sort('-created_at').exec((err, users) => {
    if (err) throw err;
    res.render('admin_users', { title: 'Administration des utilisateurs', users });
  });
});


// Update
// GET request to update a room
router.get('/users/edit/:id', isAdmin, (req, res) => {
  Users.findById(req.params.id, (err, userToModify) => {
    if (err) throw err;
    res.render('admin_user_edit', { userToModify, title: 'Éditer un utilisateur' });
  });
});

// POST request to update a user
router.post('/users/edit/:id', isAdmin, usersController.update);


// Delete
// DELETE request to delete a user
router.delete('/users/:id', isAdmin, usersController.delete);

/**
 * End users management
 */

/**
 * Rooms management
 */

// Index
// GET request for all rooms page management
router.get('/rooms', isAdmin, (req, res) => {
  Rooms.find().sort('-open_at').exec((err, rooms) => {
    if (err) throw err;
    res.render('admin_rooms', { title: 'Administration des salles', rooms });
  });
});

// Create
// GET request for creating room
router.get('/rooms/create', isAdmin, (req, res) => {
  res.render('admin_room_create', { title: 'Créer une nouvelle salle' });
});

// POST request for creating room
router.post('/rooms/create', isAdmin, roomsController.create);


// Update
// GET request to update a room
router.get('/rooms/edit/:id', isAdmin, (req, res) => {
  Rooms.findById(req.params.id, (err, room) => {
    if (err) throw err;
    res.render('admin_room_edit', { room, title: 'Éditer une salle' });
  });
});

// POST request to update a room
router.post('/rooms/edit/:id', isAdmin, roomsController.update);

// Delete
// DELETE request to delete a room
router.delete('/rooms/:id', isAdmin, roomsController.delete);

/**
 * End rooms management
 */

/**
 * Rooms management
 */

// Index
// GET request for all rooms page management
router.get('/ads', isAdmin, (req, res) => {
  Ads.find().sort('-created_at').exec((err, ads) => {
    if (err) throw err;
    res.render('admin_ads', {
      title: 'Administration des publicités',
      ads
    });
  });
});

// Create
// GET request for creating room
router.get('/ads/create', isAdmin, (req, res) => {
  res.render('admin_ad_create', {
    title: 'Créer une nouvelle publicité'
  });
});

// POST request for creating room
router.post('/ads/create', isAdmin, upload.single('link'), adsController.create);


// Update
// GET request to update a room
router.get('/ads/edit/:id', isAdmin, (req, res) => {
  Ads.findById(req.params.id, (err, ad) => {
    if (err) throw err;
    res.render('admin_ad_edit', {
      ad,
      title: 'Éditer une publicité'
    });
  });
});

// POST request to update an ad
router.post('/ads/edit/:id', isAdmin, upload.single('link'), adsController.update);

// Delete
// DELETE request to delete an ad
router.delete('/ads/:id', isAdmin, adsController.delete);

/**
 * End ads management
 */


 /**
  * Maintenance
  */
router.get('/clearUsersFromRooms', isAdmin, (req, res) => {
  Users.update({}, {
    joinedRoom: '',
  }, (err) => {
    if (err) throw err;
    req.flash('success', 'Utilisateurs libérés des salles !');
    res.sendStatus(200);
  });
});

router.get('/reboot', isAdmin, (req, res) => {
  process.exit(-1);
});
/**
 * End Maintenance
 */


module.exports = router;
