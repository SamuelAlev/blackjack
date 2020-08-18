const User = require('../models/users');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const async = require('async');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const gravatar = require('gravatar');

// Create
exports.register = (req, res) => {
  const email = req.body.email;
  const username = req.body.username;
  const password = req.body.password;
  const password2 = req.body.password2;
  const firstName = req.body.first_name;
  const lastName = req.body.last_name;
  const city = req.body.city;

  // Check if there is some errors into the user's values
  req.checkBody('first_name', 'Le prénom doit être renseigné !').notEmpty();
  req.checkBody('last_name', 'Le nom doit être renseigné !').notEmpty();
  req.checkBody('city', 'La ville doit être renseignée !').notEmpty();
  req.checkBody('username', 'Le pseudonyme doit être renseigné !').notEmpty();
  req.checkBody('username', 'Le nom d\'utilisateur doit être alphanumérique sans espace !')
    .matches(/^[a-zA-Z0-9_.-]*$/);
  req.checkBody('email', 'L\'adresse mail doit être renseignée !').notEmpty();
  req.checkBody('email', 'L\'adresse mail doit être être correcte !').isEmail();
  req.checkBody('password', 'Le mot de passe doit être renseigné !').notEmpty();
  req.checkBody('password2', 'Les mots de passe ne correspondent pas !').equals(req.body.password);

  const errors = req.validationErrors();

  const avatar = gravatar.url(email, { protocol: 'https', s: '200' });

  // If error, re-render else create user and save
  if (errors) {
    res.render('register', {
      title: 'S\'inscrire',
      errors,
      firstName,
      lastName,
      city,
      username,
      email,
    });
  } else {
    const newUser = new User({
      email,
      username,
      lastName,
      firstName,
      password,
      city,
      avatar,
    });

    // Crypt the user
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        console.log(err);
        req.flash('danger', 'Une erreur est survenue lors de l\'inscription de l\'utilisateur !');
        res.render('register', {
          title: 'S\'inscrire',
          errors,
          firstName,
          lastName,
          city,
          username,
          email,
        });
      }
      // Hash the password
      bcrypt.hash(newUser.password, salt, (err, hash) => {
        if (err) {
          console.log(err);
          req.flash('danger', 'Une erreur est survenue lors de l\'inscription de l\'utilisateur !')
          res.render('register', {
            title: 'S\'inscrire',
            errors,
            firstName,
            lastName,
            city,
            username,
            email,
          });
        }
        newUser.password = hash;

        // Save the user
        newUser.save((err) => {
          if (err) {
            console.log(err);
            req.flash('danger', 'Le pseudonyme/adresse mail est déjà utilisé !');
            res.render('register', {
              title: 'S\'inscrire',
              errors,
              firstName,
              lastName,
              city,
              username,
              email,
            });
          } else {
            req.flash('success', 'Vous êtes inscrit, vous pouvez maintenant vous connecter !');
            res.redirect('login');
          }
        });
      });
    });
  }
};


// Login
exports.login = (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/rooms',
    failureRedirect: '/users/login',
    failureFlash: true,
  })(req, res, next);
};

// Forgot password
exports.forgot_password = (req, res, next) => {
  async.waterfall([
    // Generate a random string of 20 bytes
    (done) => {
      crypto.randomBytes(20, (err, buf) => {
        const token = buf.toString('hex');
        done(err, token);
      });
    },
    // Find a user associated with the mail and set him the token
    (token, done) => {
      User.findOne({ email: req.body.email }, (err, user) => {
        if (!user) {
          req.flash('error', 'Aucun compte n\'existe avec cette adresse mail !');
          return res.redirect('/users/forgot');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        user.save((err) => {
          done(err, token, user);
        });
      });
    },
    // Send the mail with the token
    (token, user, done) => {
      const smtpTransport = nodemailer.createTransport({
        host: 'a hostname', // hostname
        secureConnection: true, // use SSL
        port: 465, // port for secure SMTP
        auth: {
          user: 'a mail address',
          pass: 'a password',
        },
      });
      const mailOptions = {
        to: user.email,
        from: 'a mail adress',
        subject: 'Réinitialisation mot de passe',
        text: 'Vous recevez ce mail parce que vous ou quelqu\'un d\'autre avez demandé la réinitialisation du mot de passe pour votre compte sur le site <a website>.\n\n' +
          'Veuillez cliquer sur le lien suivant, ou collez-le dans votre navigateur pour terminer le processus:\n\n' +
          'http://' + req.headers.host + '/users/reset/' + token + '\n\n' +
          'Si vous ne l\'avez pas demandé, veuillez ignorer cet e-mail et votre mot de passe restera inchangé.\n'
      };
      smtpTransport.sendMail(mailOptions, (err) => {
        req.flash('info', `Un mail a été envoyé à ${user.email} avec plus d'information.`);
        done(err, 'done');
      });
    },
  ], (err) => {
    if (err) return next(err);
    res.redirect('/users/forgot');
  });
};


// Reset password
exports.reset_password = (req, res) => {
  async.waterfall([
    (done) => {
      // Check again if the token is ok and replace the password (with encryption)
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, (err, user) => {
        if (!user) {
          req.flash('danger', 'Le token est incorrect ou a expiré !');
          return res.redirect('back');
        }

        const password = req.body.password;
        const password2 = req.body.password2;

        req.checkBody('password', 'Le mot de passe doit être renseigné !').notEmpty();
        req.checkBody('password2', 'Les mots de passe ne correspondent pas !').equals(req.body.password);

        const errors = req.validationErrors();

        // If error, re-render else create user and save
        if (errors) {
          res.render('reset_password', { errors });
        } else {
          user.resetPasswordToken = undefined;
          user.resetPasswordExpires = undefined;

          // Crypt the user password
          bcrypt.genSalt(10, (err, salt) => {
            if (err) {
              console.log(err);
              req.flash('danger', 'Une erreur est survenue lors de la modification du mot de passe !');
              res.redirect('/users/forgot');
            }
            // Hash the password
            bcrypt.hash(password, salt, (err, hash) => {
              if (err) {
                console.log(err);
                req.flash('danger', 'Une erreur est survenue lors de la modification du mot de passe !');
                res.redirect('/users/forgot');
              }
              user.password = hash;

              // Save the user
              user.save((err) => {
                if (err) {
                  console.log(err);
                  req.flash('danger', 'Une erreur est survenue lors de la modification du mot de passe !');
                  res.redirect('/users/forgot');
                } else {
                  done(err, user);
                }
              });
            });
          });
        }
      });
    },
    // Send mail to confirm the changement
    (user, done) => {
      const smtpTransport = nodemailer.createTransport({
        host: 'a hostname', // hostname
        secureConnection: true, // use SSL
        port: 465, // port for secure SMTP
        auth: {
          user: 'a mail address',
          pass: 'a password',
        },
      });
      const mailOptions = {
        to: user.email,
        from: 'a mail address',
        subject: 'Votre mot de passe a été modifié',
        text: 'Bonjour,\n\n' +
          'Ceci est une confirmation que le mot de passe pour votre compte ' + user.email + ' vient juste d\'être modifié.\n'
      };
      smtpTransport.sendMail(mailOptions, (err) => {
        req.flash('success', 'Votre mot de passe a bien été changé !');
        done(err);
      });
    },
  ], () => {
    // After all redirect the user to login page
    res.redirect('/users/login');
  });
};


// Update
exports.update = (req, res) => {
  const user = {};
  user.firstName = req.body.firstName;
  user.lastName = req.body.lastName;
  user.username = req.body.username;
  user.email = req.body.email;
  user.city = req.body.city;
  user.joinedRoom = req.body.joinedRoom;

  const query = { _id: req.params.id };

  User.update(query, user, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
    req.flash('success', `Utilisateur #${req.params.id} mis à jour !`);
    res.redirect('/admin/users');
  });
};


// Delete
exports.delete = (req, res) => {
  const query = { _id: req.params.id };

  User.remove(query, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
    req.flash('success', `Utilisateur #${req.params.id} supprimé !`);
    res.send('Successfully deleted!');
  });
};
