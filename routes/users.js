const express = require('express');
const User = require('../models/users');

const router = express.Router();

// Require controller modules
const usersController = require('../controllers/usersController');

// GET request to register an user
router.get('/register', (req, res) => {
  res.render('register', { title: 'S\'inscrire' });
});

// POST request to register an user
router.post('/register', usersController.register);


// GET request to login an user
router.get('/login', (req, res) => {
  res.render('login', { title: 'Se connecter' });
});

// POST request to login an user
router.post('/login', usersController.login);


// GET request for forgotten password
router.get('/forgot', (req, res) => {
  res.render('forgot_password', { title: 'Réinitialiser son mot de passe' });
});

// POST request for forgotten password
router.post('/forgot', usersController.forgot_password);

// GET request for the reset password
router.get('/reset/:token', (req, res) => {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, (err, user) => {
    if (!user) {
      req.flash('danger', 'Le token est incorrect ou a expiré !');
      return res.redirect('/users/forgot');
    }
    res.render('reset_password', { title: 'Réinitialiser son mot de passe' });
  });
});

// POST request for the reset password
router.post('/reset/:token', usersController.reset_password);


// GET request to logout an user
router.get('/logout', (req, res) => {
  req.logout();
  req.flash('success', 'Vous êtes déconnecté !');
  res.redirect('/');
});

module.exports = router;
