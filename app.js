// Requires
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const expressValidator = require('express-validator');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const passport = require('passport');
const Agenda = require('agenda');
const process = require('process');
const Agendash = require('agendash');
const config = require('./config/database');

// Connect to the mongodb
mongoose.connect(config.database, {
  socketTimeoutMS: 0,
  keepAlive: true,
  reconnectTries: 10,
});

// Log if connected to the db and if there is an error
const db = mongoose.connection;
db.once('open', () => {
  const date = new Date();
  console.log(`[${date.getHours()}:${date.getMinutes()}] [Worker] Connected to MongoDB`);

  const schedules = db.collection('schedules');

  schedules.update({
    lockedAt: {
      $exists: true,
    },
    lastFinishedAt: {
      $exists: false,
    },
  }, {
    $unset: {
      lockedAt: undefined,
      lastModifiedBy: undefined,
      lastRunAt: undefined,
    },
    $set: {
      nextRunAt: new Date(),
    },
  }, {
    multi: true,
  }, (err, numUnlocked) => {
    if (err) {
      console.error(err);
    }
    console.log(`[${date.getHours()}:${date.getMinutes()}] [Worker] Unlocked %d Agenda jobs.`, parseInt(numUnlocked.result.nModified, 10) || 0);
  });
});

db.on('error', (err) => {
  console.log(err);
});


// Load Express into app
const app = express();

// Set the static folder
app.use(express.static(path.join(__dirname, 'public')));


// Charge the french language in moment
app.locals.moment = require('moment');
app.locals.moment.locale('fr');


// Load view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Body Parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Cookie Parser middleware
app.use(cookieParser());

// Express Session middleware
app.use(session({
  secret: 'a long secret',
  resave: true,
  saveUninitialized: true,
  maxAge: new Date(Date.now() + 3600000),
  store: new MongoStore({ mongooseConnection: mongoose.connection }),
}));


// Express Message middleware
app.use(require('connect-flash')());

app.use((req, res, next) => {
  res.locals.messages = require('express-messages')(req, res);
  next();
});


// Express Validator middleware
app.use(expressValidator({
  errorFormatter: (param, msg, value) => {
    const namespace = param.split('.');
    const root = namespace.shift();
    let formParam = root;
    while (namespace.length) {
      formParam += `[${namespace.shift()}]`;
    }
    return {
      param: formParam,
      msg,
      value,
    };
  },
}));

// Passport config
require('./config/passport')(passport);
// Passport middleware
app.use(passport.initialize());
app.use(passport.session());


// Global var for user
app.get('*', (req, res, next) => {
  res.locals.user = req.user || null;
  next();
});


// Set the routes
const index = require('./routes/index');

app.use('/', index);

const rooms = require('./routes/rooms');

app.use('/rooms', rooms);

const users = require('./routes/users');

app.use('/users', users);

const admin = require('./routes/admin');

app.use('/admin', admin);


// Setup scheduler recovery
const agenda = new Agenda({ db: { address: config.database, collection: 'schedules' } });

// GUI for scheduler
app.use(
  '/dash',
  (req, res, next) => {
    if (!req.user || !req.user.admin) {
      res.send(401);
    } else {
      next();
    }
  },
  Agendash(agenda),
);

function graceful() {
  console.log('Server Shutting down');
  agenda.stop(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

agenda.on('ready', () => {
  agenda.start();
});


// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// Error handler
app.use((err, req, res) => {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
