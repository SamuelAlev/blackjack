/* eslint no-param-reassign: ["error", { "props": false }] */
const Rooms = require('./models/rooms.js');
const Users = require('./models/users.js');
const fs = require('fs');
const nodemailer = require('nodemailer');

const LOG_FILES_PATH = 'log_files/Room_';

const CARDS = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 10,
  Q: 10,
  K: 10,
  A: [1, 11],
};

const NBR_DECKS = 6;

const MODES = ['manual', 'auto', 'spectator'];
const HANDMODES = ['playing', 'surrender', 'blackjack', 'even_money'];

const TIMEOUTTIMEBOT = 5000;

// VERIFICATIONTIMEOUTTIME is used in the view with setInterval
// If it were to be used with the setTimeout function,
// it should be := VERIFICATIONTIMEOUTTIME * 1000
const VERIFICATIONTIMEOUTTIME = 12;

const shuffleArray = arr => arr.sort(() => Math.random() - 0.5);

function register(fileName, msg) {
  msg += '\n';
  fs.appendFile(`${LOG_FILES_PATH}${fileName}.txt`, msg, (err) => {
    if (err) throw err;
  });
}

function initShoe() {
  const shoe = [];
  for (let i = 0; i < NBR_DECKS * 4; i += 1) {
    Array.prototype.push.apply(
      shoe,
      (shuffleArray(Object.keys(CARDS))
      ),
    );
  }
  return shoe;
}

function getScore(hand) {
  let score = 0;
  let aces = 0;
  hand.forEach((card) => {
    if (card !== 'A') {
      score += CARDS[card];
    } else {
      aces += 1;
    }
  });

  score += 11 * aces;

  while (aces > 0) {
    if (score > 21) {
      score -= 10;
    }
    aces -= 1;
  }
  return score;
}

function getWinners(arr) {
  let players = arr.slice();
  let winners = [arr[0]];
  players.splice(0, 1);

  let i = 0;
  while (i < players.length) {
    if (players[i].getBalance() > winners[0].getBalance()) {
      players = players.concat(winners.slice());
      winners = [players[i]];
      players.splice(i, 1);
    } else if (players[i].getBalance() === winners[0].getBalance()) {
      winners.push(players[i]);
      players.splice(i, 1);
    } else {
      i += 1;
    }
  }

  const balance = winners[0].getBalance();
  for (let i = 0; i < winners.length; i += 1) {
    winners[i] = winners[i].getName();
  } winners.push(balance);

  return { winners, rest: players };
}

class Player {
  constructor(socks, roomId, playerId, mode) {
    this.to; // Timer
    this.socks = socks;
    this.roomId = roomId;
    this.playerId = playerId;
    this.username;
    this.initUsername();

    this.TIMEOUTTIME = 22000;

    this.balance;
    this.minBet;
    this.maxBet;
    this.incrementVal;

    this.bets = [];
    this.hands = [[]];
    this.handsMode = [];
    this.currentHandIndex = 0;

    this.mode;
    this.setMode(mode);
  }

  getTotalBet() {
    let totalBets = 0;
    this.bets.forEach((bet) => {
      totalBets += bet;
    });
    return totalBets;
  }

  bet(obj) {
    clearTimeout(this.to);

    if (typeof obj === 'undefined') {
      // Start bet
      if (this.getMode() === 'manual') {
        // Manual
        this.socks.to(this.getRoomId()).emit('activate turn', { username: this.getName() });
        this.socks.to(this.getRoomId()).emit('activate bet', { username: this.getName(), defaultBet: this.getMin() });
        this.socks.to(this.getRoomId()).emit('activate timer', ((this.TIMEOUTTIME / 1000) - 2));
        this.to = setTimeout(() => {
          this.socks.to(this.getRoomId()).emit('desactivate timer');
          this.socks.to(this.getRoomId()).emit('ask bet stop', { username: this.getName() });
        }, (this.TIMEOUTTIME - 500));
      } else {
        // Bot
        this.socks.to(this.getRoomId()).emit('activate turn', { username: this.getName() });
        this.socks.to(this.getRoomId()).emit('activate timer', ((this.TIMEOUTTIME / 1000) - 2));
      }
    } else {
      // Recieve bet
      obj.bet = this.normalizeBet(obj.bet);
      if (obj.bet > this.getBalance()) {
        obj.bet = this.getBalance();
      }
      this.bets.push(obj.bet);
      this.socks.to(this.getRoomId()).emit('desactivate timer');
      this.updateBetsView();
    }
  }

  normalizeBet(bet) {
    if (bet < this.getMin()) {
      return this.getMin();
    }
    const res = this.getIncVal() * parseInt(bet / this.getIncVal());
    if (res < this.getMin()) {
      return this.getMin();
    } else if (res > this.getMax()) {
      return this.getMax();
    }
    return res;
  }

  canSurrender(dealerHand) {
    // A player can surronder if he has only 1 hand AND
    // only 2 cards in that hand AND
    // only if the dealer and him don't have an Ace
    if (this.hands.length > 1) {
      return false;
    }
    if (this.getHand(this.getCurrentHandIndex()).length > 2) {
      return false;
    }
    if (dealerHand.includes('A')) {
      return false;
    }
    if (this.getHand(0).includes('A')) {
      return false;
    }
    return true;
  }

  canHit() {
    // Player can hit if he has less then 21 in the current hand
    return getScore(this.getHand(this.getCurrentHandIndex())) < 21;
  }

  canDouble() {
    // A player can double if he has only 2 cards in the current hand
    // And less then 21 (<canHit()> function) in the current hand
    // And his balance >= min bet
    const cond1 = getScore(this.getHand(this.getCurrentHandIndex())) <= 21;
    const cond2 = this.getHand(this.getCurrentHandIndex()).length === 2;
    const cond3 = this.getBalance() >= (this.getBet(this.getCurrentHandIndex()) * 2);
    const cond4 = this.getHandMode(this.getCurrentHandIndex()) === 'blackjack';
    const cond5 = this.getBalance() >= (this.getTotalBet() + this.getBet(this.getCurrentHandIndex()));
    return ((cond1 && cond2 && cond3) || cond4) && cond5;
  }

  canSplit() {
    // Player can split if he has only 2 cards
    // If those 2 cards have the same score
    // And if his current score is less then 21
    const cond1 = this.getHand(this.getCurrentHandIndex()).length === 2;
    const card1 = this.getHand(this.getCurrentHandIndex())[0];
    const card2 = this.getHand(this.getCurrentHandIndex())[1];
    const cond2 = CARDS[card1] === CARDS[card2];
    const cond3 = this.canHit();
    const cond4 = this.getBalance() >= (2 * this.getBet(this.getCurrentHandIndex()));
    const cond5 = this.getBalance() >= (this.getTotalBet() + this.getBet(this.getCurrentHandIndex()));
    const cond6 = this.hands.length < 4;
    return cond1 && cond2 && cond3 && cond4 && cond5 && cond6;
  }

  canEvenMoney(dealerHand) {
    // Player can even money if the dealer has an Ace
    // And player has blackjack in the current hand
    return this.getHandMode(this.getCurrentHandIndex()) === 'blackjack' && dealerHand.includes('A');
  }

  getValidActions(dealerHand) {
    if (getScore(this.getHand(this.getCurrentHandIndex())) > 21) {
      return [];
    }
    const validActions = ['stand'];
    if (this.canHit()) {
      validActions.push('hit');
    }
    if (this.canSurrender(dealerHand)) {
      validActions.push('surrender');
    }
    if (this.canDouble()) {
      validActions.push('double');
    }
    if (this.canSplit()) {
      validActions.push('split');
    }
    if (this.canEvenMoney(dealerHand)) {
      validActions.push('even_money');
    }
    return validActions;
  }

  surrender() {
    clearTimeout(this.to);

    this.handsMode[this.getCurrentHandIndex()] = 'surrender';
    this.bets[this.getCurrentHandIndex()] /= 2;
    this.activateBetHandScore();
  }

  evenMoney() {
    clearTimeout(this.to);
    this.handsMode[this.getCurrentHandIndex()] = 'even_money';
  }

  stand() {
    // this.activateBetHandScore();
    clearTimeout(this.to);
  }

  hit(obj) {
    this.addCard(this.getCurrentHandIndex(), obj.shoe.shift());
    this.activateBetHandScore();
    if (getScore(this.getHand(this.getCurrentHandIndex())) > 21) {
      this.socks.to(this.getRoomId()).emit('ask play stop', { username: this.getName() });
    }
  }

  double(obj) {
    this.activateBetHandScore();
    this.bets[this.getCurrentHandIndex()] *= 2;
    this.addCard(this.getCurrentHandIndex(), obj.shoe.shift());
    this.activateBetHandScore();
    if (this.getHandMode(this.getCurrentHandIndex()) === 'blackjack') {
      this.handsMode[this.getCurrentHandIndex()] = 'playing';
    }

    this.stand();
  }

  split(obj) {
    clearTimeout(this.to);
    const handTmp = this.getHand(this.getCurrentHandIndex());
    const hand = [
      [handTmp[0], obj.shoe.shift()],
      [handTmp[1], obj.shoe.shift()],
    ];
    this.hands.splice(this.getCurrentHandIndex(), 1, hand[0]);
    if (getScore(hand[0]) === 21) {
      this.handsMode[this.getCurrentHandIndex()] = 'blackjack';
    }
    this.hands.splice(this.getCurrentHandIndex() + 1, 0, hand[1]);
    this.handsMode.splice(this.getCurrentHandIndex() + 1, 0, (getScore(hand[1]) === 21) ? 'blackjack' : 'playing');
    this.addBet(this.getBet(this.getCurrentHandIndex()));

    this.activateBetHandScore();
  }

  play(obj) {
    clearTimeout(this.to);
    this.socks.to(this.getRoomId()).emit('desactivate timer');
    this.socks.to(this.getRoomId()).emit('activate timer', ((this.TIMEOUTTIME / 1000) - 2));
    this.socks.to(this.getRoomId()).emit('activate turn', { username: this.getName() });

    if (this.getMode() === 'manual') {
      // Manual
      let validActions = this.getValidActions(obj.dealerHand);
      if (typeof obj.action === 'undefined' && validActions.length === 0) {
        clearTimeout(this.to);
        this.socks.to(this.getRoomId()).emit('ask play stop', { username: this.getName() });
      } else {
        if (typeof obj.action !== 'undefined') {
          if (obj.action === 'surrender') {
            this.surrender();
          } else if (obj.action === 'even_money') {
            this.evenMoney();
          } else if (obj.action === 'stand') {
            this.stand();
          } else if (obj.action === 'hit') {
            this.hit(obj);
          } else if (obj.action === 'double') {
            this.double(obj);
          } else if (obj.action === 'split') {
            this.split(obj);
          } else {
            throw obj.action;
          }
        }
        clearTimeout(this.to);
        validActions = this.getValidActions(obj.dealerHand);
        this.clearActions();
        this.socks.to(this.getRoomId()).emit('activate actions', { username: this.getName(), validActions });
        this.to = setTimeout(() => {
          this.socks.to(this.getRoomId()).emit('ask play stop', { username: this.getName() });
        }, (this.TIMEOUTTIME - 500));
      }
    }
  }

  updateBalance(dealerHand) {
    const dealerHasBlackjack = (getScore(dealerHand) === 21) && (dealerHand.length === 2);
    if (this.hands.length > 1) {
      for (let i = 0; i < this.hands.length; i += 1) {
        if (this.getHandMode(i) === 'blackjack') {
          this.handsMode[i] = 'playing';
        }
      }
    }
    for (let i = 0; i < this.hands.length; i += 1) {
      if (dealerHasBlackjack && !(['blackjack', 'even_money'].includes(this.getHandMode(i)))) {
        this.balance -= this.getBet(i);
      } else if (this.getHandMode(i) === 'surrender') {
        this.balance -= this.getBet(i);
      } else if (this.getHandMode(i) === 'blackjack' && !(dealerHasBlackjack)) {
        this.balance += (this.getBet(i) * 1.5);
      } else if (this.getHandMode(i) === 'even_money') {
        this.balance += this.getBet(i);
      } else if (this.getHandMode(i) === 'playing') {
        const handScore = getScore(this.getHand(i));
        const dealerScore = getScore(dealerHand);
        if (handScore > 21) {
          this.balance -= this.getBet(i);
        } else if (dealerScore > 21) {
          this.balance += this.getBet(i);
        } else if (handScore > dealerScore) {
          this.balance += this.getBet(i);
        } else if (handScore < dealerScore) {
          this.balance -= this.getBet(i);
        }
      }
      this.updateBalanceView();
      if (this.getBalance() < this.getMin()) {
        this.setMode('spectator');
      }
    }
  }

  activateBetHandScore() {
    const bets = this.bets.slice(0, this.getCurrentHandIndex() + 1);
    const hands = this.hands.slice(0, this.getCurrentHandIndex() + 1);
    const scores = [];

    hands.forEach((hand) => {
      scores.push(getScore(hand));
    });
    this.socks.to(this.getRoomId()).emit(
      'activate player bet',
      { username: this.getName(), bets, index: this.getCurrentHandIndex() },
    );
    this.socks.to(this.getRoomId()).emit(
      'activate player hand',
      { username: this.getName(), hands, index: this.getCurrentHandIndex() },
    );
    this.socks.to(this.getRoomId()).emit(
      'activate player score',
      { username: this.getName(), scores, index: this.getCurrentHandIndex() },
    );
  }

  clearActions() {
    this.socks.to(this.getRoomId()).emit('desactivate actions');
  }

  updateBalanceView() {
    this.socks.to(this.getRoomId()).emit('update player balance', { username: this.getName(), balance: this.getBalance() });
  }

  updateBetsView() {
    this.socks.to(this.getRoomId()).emit('update player bets', { username: this.getName(), bets: this.bets });
  }

  updateHandsView() {
    this.socks.to(this.getRoomId()).emit('update player hands', { username: this.getName(), hands: this.hands });
  }

  updateScoresView() {
    const scores = [];
    this.hands.forEach((hand) => {
      scores.push(getScore(hand));
    });
    this.socks.to(this.getRoomId()).emit('update player scores', { username: this.getName(), scores });
  }

  getBalance() {
    return this.balance;
  }

  getMin() {
    return this.minBet;
  }

  getMax() {
    return this.maxBet;
  }

  getIncVal() {
    return this.incrementVal;
  }

  getRoomId() {
    return this.roomId;
  }

  getId() {
    return this.playerId;
  }

  getName() {
    return this.username;
  }

  getMode() {
    return this.mode;
  }

  getBet(index) {
    return this.bets[index];
  }

  getHand(index) {
    return this.hands[index];
  }

  getHandMode(index) {
    return this.handsMode[index];
  }

  getCurrentHandIndex() {
    return this.currentHandIndex;
  }

  setMode(mode) {
    const i = MODES.indexOf(mode);
    if (i === -1) {
      throw mode;
    } else {
      this.mode = MODES[i];
    }
  }

  addHandMode(handMode) {
    const i = HANDMODES.indexOf(handMode);
    if (i === -1) {
      throw handMode;
    } else {
      this.handsMode.push(HANDMODES[i]);
    }
  }

  addBet(bet) {
    this.bets.push(bet);
  }

  addCard(handIndex, card) {
    this.hands[handIndex].push(card);
  }

  incCurrentHandIndex() {
    this.currentHandIndex += 1;
  }

  turnOver() {
    return this.currentHandIndex >= (this.hands.length - 1);
  }

  resetTurn() {
    this.bets = [];
    this.hands = [[]];
    this.handsMode = [];
    this.currentHandIndex = 0;
    this.updateBetsView();
    this.updateHandsView();
    this.updateScoresView();
  }

  async initUsername() {
    /*
    * init the username when a player has joined the room for the first time
    */
    if (this.getId() !== -1) {
      await Users.findById(this.getId(), (err, user) => {
        if (err) throw err;
        this.username = user.username;
      });
    } else {
      this.username = 'Bot';
    }
  }

  async initPlayerBalanceMinMax(roomId) {
    await Rooms.findById(roomId, (err, room) => {
      if (err) throw err;
      this.balance = room.balance;
      this.minBet = room.min_bet;
      this.maxBet = room.max_bet;
      this.incrementVal = room.increment_bet;
    });
  }
}

class Room {
  constructor(socks, roomId) {
    this.socks = socks;
    this.hasStarted = false;
    this.playerStartTurn;
    this.updateStartTurn = true;

    this.roomId = roomId;
    this.balance;
    this.minBet;
    this.maxBet;
    this.incrementVal;

    this.dealer = new Player(socks, roomId, -1, 'auto');
    this.dealer.username = 'dealer';
    this.players = [];
    this.currentAction = 'bet';

    // Defined when the game has started; NOTE: can only be defined once!
    this.nbrTurns;
    this.currentTurn = 0;

    this.getBalanceMinMaxDB();
    this.shoe = initShoe();
  }

  getId() {
    return this.roomId;
  }

  parser(obj) {
    this.players.forEach((player) => {
      clearTimeout(player.to);
    });

    if (this.hasWinner()) {
      this.socks.to(this.getId()).emit('desactivate actions');
      this.currentTurn = this.nbrTurns - 1;
      this.verification();
    } else {
      this.socks.to(this.getId()).emit('desactivate actions');
      switch (this.currentAction) {
        case 'bet':
          if (this.players[0].getMode() === 'auto') {
            const player = this.players[0];
            register(this.roomId, `Bot ${player.getName()} is betting with the minBet value`);
            player.bet();
            setTimeout(() => {
              player.bet({ bet: -1 });
              this.updateTurn();
            }, TIMEOUTTIMEBOT);
          } else {
            this.players[0].bet(obj);
          }
          break;
        case 'distribute_cards':
          this.distributeCards();
          register(this.roomId, 'Distribution des cartes aux joueurs');
          break;
        case 'play':
          if (this.players[0].getMode() === 'auto') {
            const player = this.players[0];
            player.play({ shoe: this.shoe, dealerHand: this.dealer.getHand(0) });
            setTimeout(() => {
              player.activateBetHandScore();
              this.updateTurn();
            }, TIMEOUTTIMEBOT);
          } else if (typeof obj === 'undefined') {
            this.players[0].play({
              dealerHand: this.dealer.getHand(0),
            });
          } else {
            obj.shoe = this.shoe;
            obj.dealerHand = this.dealer.getHand(0);
            this.players[0].play(obj);
          }
          this.updateShoe();
          break;
        case 'verification':
          this.currentTurn += 1;
          this.socks.to(this.getId()).emit('desactivate turns');
          this.players.forEach((player) => {
            clearTimeout(player.to);
          });
          while (getScore(this.dealer.getHand(0)) < 17) {
            this.dealer.addCard(0, this.shoe.shift());
          }
          this.dealer.updateHandsView();
          this.dealer.updateScoresView();
          this.players.forEach((player) => {
            player.updateBalance(this.dealer.getHand(0));
          });
          this.socks.to(this.getId()).emit('desactivate timer');
          this.socks.to(this.getId()).emit('activate timer', VERIFICATIONTIMEOUTTIME - 2);
          setTimeout(() => {
            this.socks.to(this.getId()).emit('desactivate timer');
            this.verification();
          }, (VERIFICATIONTIMEOUTTIME * 1000 - 500));
          register(this.roomId, 'Vérification des mains');
          break;
        default:
          console.log(`${this.currentAction } Case not handled properly <default in parser(obj)>`);
      }
      /* Update when:
          - obj is defined and it doesn't contain action: 'hit' or 'split'
      */
      if (typeof obj !== 'undefined' &&
          !(['hit', 'split'].includes(obj.action)) &&
          this.currentAction !== 'verification') {
        this.updateTurn();
      }
    }
  }

  distributeCards() {
    for (let i = 0; i < 2; i += 1) {
      this.players.forEach((player) => {
        if (player.getMode() !== 'spectator') {
          player.addCard(player.getCurrentHandIndex(), this.shoe.shift());
        }
      });
    }

    this.players.forEach((player) => {
      if (player.getMode() !== 'spectator') {
        if (getScore(player.getHand(0)) === 21) {
          player.addHandMode('blackjack');
        } else {
          player.addHandMode('playing');
        }
        player.activateBetHandScore();
      }
    });
    this.dealer.addCard(0, this.shoe.shift());
    this.dealer.activateBetHandScore();
    this.updateShoe();

    this.currentAction = 'play';
    register(this.roomId, 'Go to play mode');
    this.parser();
  }

  verification() {
    let i = 0;
    while (i < this.players.length) {
      if (this.players[i].getMode() === 'spectator') {
        const username = this.players[i].getName();
        this.socks.to(this.getId()).emit('update player bets', { username, bets: [] });
        this.socks.to(this.getId()).emit('update player hands', { username, hands: [] });
        this.socks.to(this.getId()).emit('update player scores', { username, scores: [] });

        this.players.splice(i, 1);
        if (this.updateStartTurn && (i === 0)) {
          this.updateStartTurn = false;
        }
      } else {
        i += 1;
      }
    }
    if (this.updateStartTurn) {
      this.updateNextPlayerTurn();
    } else {
      this.updateStartTurn = true;
    }

    if (this.players.length <= 1) {
      this.currentTurn = this.nbrTurns;
    }
    if (this.players.length !== 0) {
      this.resetTurns();
    }
    if (this.currentTurn >= (this.nbrTurns - 2)) {
      this.players.forEach((player) => {
        player.TIMEOUTTIME = 62000;
      });
    }
    if (this.currentTurn < this.nbrTurns) {
      // Go to next turn
      this.updateTurnText();
      this.parser();
    } else {
      // Game is over -> Update db for room and players
      this.hasStarted = false;
      if (this.players.length > 0) {
        this.updateWinners();
      } else {
        this.socks.to(this.getId()).emit('from server', 'Aucun gagnant !');
        register(this.roomId, 'Aucun gagnant !');
        Rooms.updateOne({ _id: this.getId() }, { $set: { winners: 'Aucun gagnant !' } }).exec();
        this.winners = 'Aucun gagnant !';
      }
      Rooms.findOne({ _id: this.getId() }, (err, room) => {
        if (err) throw err;
        room.joinedPlayersId.forEach((playerId) => {
          Users.updateOne({ _id: playerId }, { $set: { joinedRoom: null } }).exec();
        });
      });
      Rooms.updateOne({ _id: this.getId() }, { $set: { joinedPlayersId: [] } }).exec();
    }
  }

  updateTurn() {
    const player = this.players[0];
    if (player.turnOver() || (this.currentAction === 'bet')) {
      if (this.updateStartTurn) {
        this.updateNextPlayerTurn();
      } else {
        this.updateStartTurn = true;
      }
      if (this.players[0].getId() === this.getPlayerStartTurn()) {
        if (this.currentAction === 'bet') {
          this.currentAction = 'distribute_cards';
        } else if (this.currentAction === 'distribute_cards') {
          this.currentAction = 'play';
        } else {
          this.currentAction = 'verification';
        }
      }
    } else {
      player.incCurrentHandIndex();
      player.activateBetHandScore();
    }
    this.parser();
  }

  updateNextPlayerTurn() {
    const tmp = this.players.shift();
    this.players.push(tmp);
  }

  resetTurns() {
    this.players.forEach((player) => {
      player.resetTurn();
    });
    this.dealer.resetTurn();
    this.currentAction = 'bet';
    this.setPlayerStartTurn(this.players[0].getId());
  }

  hasWinner() {
    /*
    * Game is over when there is only one player with balance >= then the min bet
    */
    return this.players.length <= 1;
  }

  updateTurnText() {
    const username = this.players[0].getName();
    const currentTurn = this.currentTurn + 1;
    const maxTurns = this.nbrTurns;
    this.socks.to(this.getId()).emit(
      'update turn value',
      { username, currentTurn, maxTurns },
    );
  }

  setTurns() {
    const promise = new Promise((resolve) => {
      switch (this.players.length) {
        case 2:
          this.nbrTurns = 22;
          break;
        case 3:
          this.nbrTurns = 21;
          break;
        case 4:
          this.nbrTurns = 24;
          break;
        case 5:
          this.nbrTurns = 25;
          break;
        case 6:
          this.nbrTurns = 24;
          break;
        case 7:
          this.nbrTurns = 21;
          break;
        case 8:
          this.nbrTurns = 16;
	  break;
        case 9:
	  this.nbrTurns = 18;
          break;
        default:
          this.nbrTurns = 21;
      }
      setTimeout(resolve, 250);
    });
    promise.then(() => {
      this.updateTurnText();
    });
  }

  _setTurns() {
    const promise = new Promise((resolve) => {
      switch (this.players.length) {
        case 2:
          this.nbrTurns = 22;
          break;
        case 3:
          this.nbrTurns = 3;
          break;
        case 4:
          this.nbrTurns = 3;
          break;
        case 5:
          this.nbrTurns = 3;
          break;
        case 6:
          this.nbrTurns = 3;
          break;
        case 7:
          this.nbrTurns = 3;
          break;
        case 8:
          this.nbrTurns = 16;
          break;
        case 9:
          this.nbrTurns = 18;
          break;
        default:
          this.nbrTurns = 3;
      }
      setTimeout(resolve, 250);
    });
    promise.then(() => {
      this.updateTurnText();
    });
  }

  getPlayerStartTurn() {
    return this.playerStartTurn;
  }

  setPlayerStartTurn(playerId) {
    this.playerStartTurn = playerId;
  }

  updateShoe() {
    /* If shoe has less then 25% of the total cards -> create new shoe */
    const cardsTotal = Object.keys(CARDS).length;
    if (this.shoe.length < (cardsTotal * NBR_DECKS * 4 * 0.16)) {
      this.shoe = initShoe();
    }
  }

  gameHasStarted() {
    return this.hasStarted;
  }

  setWinners(value) {
    this.winners = value;
  }

  async updateWinners() {
    await Rooms.findById(this.getId(), (err, room) => {
      if (err) throw err;
      const winners = [];
      if (this.players.length > 0) {
        let res = getWinners(this.players);
        winners.push(res.winners);
        // if ([1, 2, 3].includes(this.players.length)) {
        if ([1, 2].includes(room.joinedPlayersId.length)) {
          // Only 1 winner (more winners with the same balance)
          Rooms.updateOne({ _id: this.getId() }, { $set: { winners } }).exec();
        } else if (room.joinedPlayersId.length >= 3) {
          // Top 3 winners
          if (res.rest.length > 0) {
            res = getWinners(res.rest);
            winners.push(res.winners);
          }
          if (res.rest.length > 0) {
            res = getWinners(res.rest);
            winners.push(res.winners);
          }
          Rooms.updateOne({ _id: this.getId() }, { $set: { winners } }).exec();
        }
      }

      this.socks.to(this.getId()).emit('from server', 'Winners:');
      register(this.roomId, 'Winners:');
      for (let i = 0; i < winners.length; i += 1) {
        this.socks.to(this.getId()).emit('from server', winners[i].join(' '));
        register(this.roomId, winners[i].join(' '));
      }

      this.winners = winners;
      JSON.stringify(this.winners);
      this.winners = this.winners.toString();

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
        to: 'a mail address',
        from: 'a mail address',
        subject: `Gagnants de la salle #${this.getId()}`,
        text: `La salle étant finie voici les gagnants de la salle #${this.getId()}:\n` +
        `${this.winners}`,
      };
      smtpTransport.sendMail(mailOptions);
    });
  }

  forcePlayer() {
    const player = this.players[0];
    register(this.roomId, `${player.getName()} has disconnected\nUpdating player...`);
    if (this.currentAction === 'bet') {
      player.bet({ bet: -1 });
    } else if (this.currentAction === 'play') {
      while (!player.turnOver()) {
        player.incCurrentHandIndex();
      }
    }
    this.updateTurn();
  }

  async getBalanceMinMaxDB() {
    await Rooms.findById(this.getId(), (err, room) => {
      if (err) throw err;
      this.balance = room.balance;
      this.minBet = room.min_bet;
      this.maxBet = room.max_bet;
      this.incrementVal = room.increment_bet;
    });
  }

  initPlayersInfo() {
    this.players.forEach((player) => {
      player.initPlayerBalanceMinMax(this.getId());
    });
    this.dealer.initPlayerBalanceMinMax(this.getId());
  }

  getPlayerIndex(playerId) {
    for (let i = 0; i < this.players.length; i += 1) {
      if (this.players[i].getId() === playerId) {
        return i;
      }
    }
  }

  addPlayer(playerId) {
    /*
    * Add new player to this.players, or if player already exists, change his mode from auto to manual
    * Wait (250 mil seconds) until the player has been added and update the view
    */
    const promise = new Promise((resolve) => {
      const index = this.getPlayerIndex(playerId);
      if (typeof index === 'undefined') {
        const player = new Player(this.socks, this.getId(), playerId, 'manual');
        player.initPlayerBalanceMinMax(this.getId());
        this.players.push(player);
      } else {
        this.players[index].setMode('manual');
      }
      shuffleArray(this.players);
      setTimeout(resolve, 250);
    });

    promise.then(() => {
      this.socks.to(this.getId()).emit('rm users');

      this.players.forEach((player) => {
        const username = player.getName();
        const balance = player.getBalance();
        this.socks.to(this.getId()).emit('add usr', { username, balance });
      });
    });
  }

  dcPlayer(playerId) {
    const index = this.getPlayerIndex(playerId);
    if (!(this.hasStarted)) {
      this.socks.to(this.getId()).emit('rm users');
      this.players.splice(index, 1);
      shuffleArray(this.players);
      this.players.forEach((player) => {
        const username = player.getName();
        const balance = player.getBalance();
        this.socks.to(this.getId()).emit('add usr', { username, balance });
      });
    } else if (typeof index !== 'undefined') {
      if (this.players[index].getMode() === 'spectator') {
        const username = this.players[index].getName();
        const bets = this.players[index].bets;
        const hands = this.players[index].hands;
        const scores = [];
        hands.forEach((hand) => {
          scores.push(getScore(hand));
        });
        this.socks.to(this.getId()).emit('update player bets', { username, bets: [] });
        this.socks.to(this.getId()).emit('update player hands', { username, hands: [] });
        this.socks.to(this.getId()).emit('update player scores', { username, scores: [] });
        this.players.splice(index, 1);
      } else {
        this.players[index].setMode('auto');
      }
      if (index === 0 && this.gameHasStarted()) {
        this.forcePlayer();
      }
    }
  }
}

exports.Player = Player;
exports.Room = Room;
