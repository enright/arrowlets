/*
The MIT License (MIT)

Copyright (c) 2013 Bill Enright

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 * Module dependencies.
 */
var events = require('events');
var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var app = express();

// Yay! Arrows!
var ARR = require('./nodeArrowlets');
var MYARR = require('./delayGameTicksA');

	// we want sockets for browser/server communication
	// and we want imghex for generation of hex tiles in browser ui
	var socketio = require('socket.io');
	var imghex = require('imghex');

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));

	// serve up board tiles from the url /boardTiles...redirect it to /views/boardTiles
	app.use('/tileImages', express.static(__dirname + '/public/images/tileImages'));
	app.use('/pieceImages', express.static(__dirname + '/public/images/pieceImages'));
	app.use('/prizeImages', express.static(__dirname + '/public/images/prizeImages'));
	app.use('/sounds', express.static(__dirname + '/public/sounds'));
	
app.use(express.bodyParser());
// not needed app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/test', function(req, res) {
	res.send('ouch');
});

function createGameIo(io, id, game) {
	var gameIo = {};
	
	// get rid of the old one if we've got the same id
	if (io.namespaces[id] !== undefined) {
		delete io.namespaces[id];
	}
	
	// creat a namespace for the game
	gameIo.namespace = io.of(id);
	
	// set up incoming message handlers on socket on connect
	gameIo.namespace.on('connection', function (socket) {
		socket.emit('text-message', 'Welcome to Quest 4 Sushi!');
		game.connected(socket);
		socket.on('start-game', game.startGame);
		socket.on('move-to', game.moveTo);
	});
		
	return gameIo;
}

var gameClockCancellers = {};

// tuple-aware repeat, used for unending loops
var repeatTuple = (function (tuple) { return ARR.Repeat(tuple); }).Arr();

function createGame(id) {
	var game = {},
		emitter = new events.EventEmitter(),
		tickCanceller,
		ticksInGame = 90, // 90 second games
		progress; // arrows canceller
		
	// add a tick count property to the emitter
	emitter.gameTick = 0;

	game.pieces = [{ rank: 0, file: 0, src: "pieceImages/sumo-wrestler.png", prizePoints: 0 }];
	game.prizes =  [{ rank: 2, file:3, src: "prizeImages/Sushi.png" },
						{ rank: 6, file: 5, src: "prizeImages/miso-soup.png" },
						{ rank: 10, file: 9, src: "prizeImages/bonsai.png" },
						{ rank: 12, file: 14, src: "prizeImages/Sushi.png" },
						{ rank: 7, file: 2, src: "prizeImages/Key.png" },
						{ rank: 11, file: 13, src: "prizeImages/Chest-Closed.png" },
					];
	game.tiles =  [{ rank: 3, file: 10, src: "tileImages/water.png" }, 
					{ rank: 4, file: 10, src: "tileImages/water.png" },
					{ rank: 3, file: 11, src: "tileImages/water.png" }];
	game.canTakeChest = false;
	
	function stopTicking () {
		clearInterval(gameClockCancellers[id]);
	}
	
	// start the game clock ticking (or resume it)
	function startTicking() {
		var canceller = setInterval(function () {
			emitter.gameTick += 1;
			emitter.emit('tick', { tick: emitter.gameTick });
		}, 1000);
		gameClockCancellers[id] = canceller;
	}
	
	function createAndRunArrows() {
		// an update to the client countdown display every second of elapsed game time
		// ListenA is not tuple-aware (it is based on original arrowlets 'EventA')
		// so we pass in a single argument through ARR.ConstA
		// our anonymous function returns ARR.Repeat() so that we can use
		// .repeat() to continue indefinitely
		var countDown =
			ARR.ConstA(emitter)
				.then(ARR.ListenA('tick'))
				.then(function (e) {
					console.log('countdown ', ticksInGame - e.tick);
					game.server_setCountdown({ ticks: ticksInGame - e.tick });
					return ARR.Repeat();
				})
				.repeat();
	
		// listen with value is tuple-aware, so start off with a tuple
		// When we get to the number of ticks in the game
		// we tell the user, cancel the arrows and clear the tick interval
		var timeoutGame =
			ARR.ConstA(new ARR.Pair(emitter, null))
				.then(ARR.ListenWithValueA('tick', 'tick', ticksInGame))
				// we really don't care what gets passed to this function
				.then(function () {
					console.log('it is game over!');
					// tell the user it's over
					game.server_sendMessage('Time has run out!');
					// play a 'losing' sound here!
					game.server_playSound({ name: 'win.m4a', gain: 0.5 });
					// cancel all arrows
					progress.cancel();
					// cancel the tick interval
					stopTicking();
				});
				
		// for starters, let the user move wherever they want, whenever
		var playerMovement = 
			ARR.ConstA(emitter)
				.then(ARR.ListenA('request-move-to'))
				.then(function (e) {
					var rank = e.rank*1, // coerce string to num
						file = e.file*1;
					
					// is there a prize here?
					prize = onAPrize(rank, file);
					if (prize) {
						// take the prize
						console.log('landed on a prize ', prize);
						emitter.emit('take-prize', { rank: rank, file: file, prize: prize });
					}
					
					// move the player
					game.pieces[0].rank = rank;
					game.pieces[0].file = file;
					game.server_movePlayer(game.pieces[0]);
					return ARR.Repeat();
				})
				.repeat();
				
		function onAPrize(rank, file) {
			var i, length = game.prizes.length;
			for (i = 0; i < length; i += 1) {
				if (game.prizes[i].rank === rank && game.prizes[i].file === file) {
					return game.prizes[i].src;
				}
			}
			return undefined;
		}
		
		function removeAPrize(rank, file) {
			var i, length = game.prizes.length;
			for (i = 0; i < length; i += 1) {
				if (game.prizes[i].rank === rank && game.prizes[i].file === file) {
					game.prizes.slice(i, 1);
					return;
				}
			}			
		}
		
		var sushiPrize =
			ARR.ConstA(new ARR.Pair(emitter, null))
				.then(
					ARR.ListenWithValueA('take-prize', 'prize', 'prizeImages/Sushi.png')
					.then((function (p) { 
							var eventData = p.fst().eventData;
							game.pieces[0].prizePoints += 100;
							game.server_setPoints(game.pieces[0].prizePoints);
							game.server_playSound({ name: 'boo', gain:0.3 });
							removeAPrize(eventData.rank, eventData.file);
							game.server_removePrize(eventData);
							return p;
						}).Arr())
				)			
			.then(repeatTuple)
			.repeat();
			
		var misoPrize =
			ARR.ConstA(new ARR.Pair(emitter, null))
				.then(
					ARR.ListenWithValueA('take-prize', 'prize', 'prizeImages/miso-soup.png')
					.then((function (p) { 
							var eventData = p.fst().eventData;
							game.pieces[0].prizePoints += 50;
							game.server_setPoints(game.pieces[0].prizePoints);
							game.server_playSound({ name: 'boo', gain:0.3 });
							removeAPrize(eventData.rank, eventData.file);
							game.server_removePrize(eventData);
							return p;
						}).Arr())
				)			
			.then(repeatTuple)
			.repeat();
		
		var bonsaiPrize =
			ARR.ConstA(new ARR.Pair(emitter, null))
				.then(
					ARR.ListenWithValueA('take-prize', 'prize', 'prizeImages/bonsai.png')
					.then((function (p) { 
							var eventData = p.fst().eventData;
							game.pieces[0].prizePoints += 75;
							game.server_setPoints(game.pieces[0].prizePoints);
							game.server_playSound({ name: 'boo', gain:0.3 });
							removeAPrize(eventData.rank, eventData.file);
							game.server_removePrize(eventData);
							return p;
						}).Arr())
				)			
			.then(repeatTuple)
			.repeat();
		
		takePrizes = sushiPrize.fanout(misoPrize).fanout(bonsaiPrize);

		// example of using the second in the pair (pair.snd()) to flip the canTake state
		var playerCanTakeChest = (function (game) {
			return function (canTake) {
				console.log('can take flip');
				game.canTakeChest = !canTake;
				return !canTake;
			};
		}(game));

		// when the player takes the chest we have to do stuff
		// lift this tuple-aware function into an arrow
		var playerTookChest = (function (pair) {
			var eventData = pair.fst().eventData,
				canTake = pair.snd();
			
			// check in case somehow someone already took it
			if (canTake) {
				// remove the chest from the game
				game.server_removePrize(eventData);
				game.server_playSound({ name: 'win.m4a', gain:0.5 });
			}
			
			// no one can take it
			pair.snd(false);
			return pair;
		}).Arr();

		// create an arrow to handle chest and key behavior
		var chestAndKey =
			ARR.ConstA(new ARR.Pair(emitter, game.canTakeChest))
				// listen for the event of the user taking the key
				.then(ARR.ListenWithValueA('take-prize', 'prize', 'prizeImages/Key.png'))
				// then flip the take chest flag - note the use of 'second()'
				.then(playerCanTakeChest.second())
				// then run either time running out or user taking the chest
				.then((ARR.DelayA(4000)
						// flip the take chest flag
						.then(playerCanTakeChest.second())
						.then((function (x) { console.log('can take chest ', x); return x; }).second()))
					// or the user got the chest and process that
					.or(ARR.ListenWithValueA('take-prize', 'prize', 'prizeImages/Chest-Closed.png')
						.then(playerTookChest)));

		function getTile(rank, file) {
			// if the tile is in our list, return it
			var i, length = game.tiles.length;
			for (i = 0; i < length; i += 1) {
				if (game.tiles[i].rank === rank && game.tiles[i].file === file) {
					return game.tiles[i];
				}
			}
			// otherwise push and return a default tile
			game.tiles.push({ rank: rank, file: file, src: 'tileImages/grassField.png' });
			return game.tiles[game.tiles.length - 1];
		}

		// apply changes and return the restore information
		function applyChanges(game, changes) {
			var i,
				length = changes.length,
				tile,
				restore = [];
			console.log('changes ', changes);
			for (i = 0; i < length; i += 1 ) {
				tile = getTile(changes[i].rank, changes[i].file);
				restore[i] = { rank: changes[i].rank, file: changes[i].file, src: tile.src };		
				tile.src = changes[i].src;
			}
			console.log('restore ', restore);
			game.server_setTiles(game.tiles);
			return restore;
		}

		// apply changes to the board and return the original tile values
		// the board is 'in' the closure of the returned function
		var boardTileChange = (function (game) {
			return function (changes) {
				return applyChanges(game, changes);
			};
		}(game));
		
		// increase the size of the puddle
		var boardChanges = [
					{ rank: 2, file: 10, src: "tileImages/water.png" }, 
					{ rank: 3, file: 10, src: "tileImages/water.png" },
					{ rank: 2, file: 11, src: "tileImages/water.png" },	
					{ rank: 4, file: 10, src: "tileImages/water.png" }, 
					{ rank: 5, file: 10, src: "tileImages/water.png" },
					{ rank: 4, file: 11, src: "tileImages/water.png" }
		];
		
		// create a board tile changing arrow
		var boardTileChanges =
			ARR.ConstA(new ARR.Pair(emitter, boardChanges))
				// wait
				.then(MYARR.DelayGameTicksA(4))
				// then change the tiles
				.then(boardTileChange.second())
				// wait
				.then(MYARR.DelayGameTicksA(6))
				// and change them back
				.then(boardTileChange.second())
				// repeat this forever
				.then(repeatTuple)
				.repeat();
			
			
		// fanout (run in parallel) the arrows we created	
		progress = countDown
			.fanout(timeoutGame)
			.fanout(playerMovement)
			.fanout(takePrizes)
			.fanout(chestAndKey)
			.fanout(boardTileChanges)
			.run();
	}
	
	// create io
	game.gameIo = createGameIo(io, id, game);
	
	// get data to the client to configure the game
	game.connected = function(socket) {
		socket.emit('board', { ranks: 20, 
			files: 15, 
			defaultImageURL: 'tileImages/grassField.png', 
			prizes: game.prizes, 
			pieces: game.pieces,
			tiles: game.tiles
		});

	};

	// handle incoming messages from client	
	game.startGame = function(data) {
		// start the game!
		emitter.gameTick = 0;		
		console.log('user requested start game');
		createAndRunArrows();
		// send an object as a message or emit may not work!
		emitter.emit('start-game', { });
		tickCanceller = startTicking();
		game.server_sendMessage('The game has started!');
		game.server_playSound({ name: 'win.m4a', gain: 0.5 });
	};
	
	game.moveTo = function(data) {
		// can the user move here?
		console.log('user request move-to ', data);
		// did they land on a prize? increase points, remove prize, update points
		emitter.emit('request-move-to', data);
	};
	
	game.server_movePlayer = function (to) {
		game.gameIo.namespace.emit('set-pieces', [to]);
	};
	
	game.server_moveMonster = function (to) {
		game.gameIo.namespace.emit('set-pieces', [{ name: 'monster', 
			src: 'pieceImages/monster.png', 
			rank: to. r, 
			file: to.f 
		}]);
	};
	
	game.server_setPoints = function (points) {
		game.gameIo.namespace.emit('set-points', points);
	};
	
	game.server_setCountdown = function (countdown) {
		game.gameIo.namespace.emit('set-countdown', countdown);
	};
	
	game.server_sendMessage = function (message) {
		game.gameIo.namespace.emit('text-message', message);
	};
	
	game.server_playSound = function (sound) {
		game.gameIo.namespace.emit('one-shot-sound', sound);
	};
	
	game.server_removePrize = function (prize) {
		game.gameIo.namespace.emit('remove-prizes', [prize]);
	};
	
	game.server_setTiles = function (tiles) {
		game.gameIo.namespace.emit('set-tiles', tiles);
	};
	
	return game;
}

app.get('/game1', function(req, res) {
	var socketId,
		socketListener,
		gameController;
	try {
		// this will be the game id
		socketId = '/game1_' + req.sessionID;
		
		createGame(socketId);
		
		//send the page across to the client
		res.render('game1', {
			title: "Game 1",
			game: socketId,
			hexTemplateCode: imghex.hexMapDivTemplate(),
			layout: false
		});
		
	} catch (e) {
		console.log(e);
	}
});

var server = http.createServer(app);
server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var io = socketio.listen(server);
io.set('log level', 1);