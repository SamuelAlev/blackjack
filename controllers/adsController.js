const moment = require('moment');

const Ad = require('../models/ads');

// Create
exports.create = (req, res) => {

  if (req.body) {

    const ad = new Ad({
      location: req.body.location,
      description: req.body.description,
      link: "/uploads/" + req.file.filename,
      dir: "/uploads/" + req.file.filename,
      pointsTo: req.body.pointsTo,
    });

    ad.save((err, ad) => {
      if (err) {
        req.flash('error', 'Une erreur est survenue !');
        res.redirect('/admin/ads/create');
        throw err;
      }

      req.flash('success', 'Publicité créée !');
      res.redirect('/admin/ads/');
    });

  } else {

    req.flash('error', "Une erreur est survenue lors de l'envois du fichier!");
    res.redirect('/admin/ads/create');

  }
  
};

// Index all
exports.index = null;

// Show one
exports.show = null;

// Update
exports.update = (req, res) => {

  const ad = {};
  ad.location = req.body.location;
  ad.description = req.body.description;
  ad.link = "/uploads/" + req.file.filename;
  ad.pointsTo = req.body.pointsTo;
  ad.updated_at = moment();

  // Update the room informations
  const query = { _id: req.params.id };

  Ad.update(query, ad, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
    req.flash('success', `Publicité #${req.params.id} mise à jour !`);
    res.redirect('/admin/ads/');
  });
};

// Delete
exports.delete = (req, res) => {

  // Remove the ad
  const adQuery = { _id: req.params.id };
  Ad.remove(adQuery, (err) => {
    if (err) {
      req.flash('error', 'Une erreur est survenue !');
      throw err;
    }
    req.flash('success', `Publicité #${req.params.id} supprimée !`);
    res.send('Successfully deleted!');
  });

};
