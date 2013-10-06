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

	// a function that returns the list of adjacent tiles
	// for a rank and file if the tiles are hexes
	function adjacentHexTiles(r, f) {
		var ranks = game.ranks,
			files = game.files,
			rIsEven = r % 2 !== 1,
			squaresToCheck = [];

		// directly above is r-2, directly below is r+2
		if (r - 2 >= 0) {
			squaresToCheck.push([r - 2, f]);
		}
		if (r + 2 < ranks) {
			squaresToCheck.push([r + 2, f]);
		}
		if (rIsEven) {
			// if r is even, then up left is r-1, down left is r+1, up right is r-1, f+1, down right is r+1, f+1
			if (r - 1 >= 0) {
				// up left
				squaresToCheck.push([r - 1, f]);
				if (f + 1 < files) {
					// up right
					squaresToCheck.push([r - 1, f + 1]);
				}
			}
			if (r + 1 < ranks) {
				// down left
				squaresToCheck.push([r + 1, f]);
				// down right
				if (f + 1 < files) {
					squaresToCheck.push([r + 1, f + 1]);
				}
			}
		} else {
			// if r is odd, up left is f-1, r-1 down left is f-1, r + 1, up right is r -1, down right is r+1
			if (r - 1 >= 0) {
				// up right
				squaresToCheck.push([r - 1, f]);
				if (f - 1 >= 0) {
					// up left
					squaresToCheck.push([r - 1, f - 1]);
				}
			}
			if (r + 1 < ranks) {
				// down right
				squaresToCheck.push([r + 1, f]);
				if (f - 1 >= 0) {
					// down left
					squaresToCheck.push([r + 1, f - 1]);
				}
			}

		}

		return squaresToCheck;
	}
	function possibleMovesFromSquares(r, f, rollvalue) {
		var possibleMoves = {};

		// given potential move-to squares, can we move to them?
		// return an array of the ones we can move to, with the resulting fuel
		function getCanEnterSquares(squaresToVisit, rollValue) {
			var canEnterSquares = [],
				i,
				j,
				length,
				r,
				f,
				testSquare,
				friction,
				possibleMove;

			for (i = 0, length = squaresToVisit.length; i < length; i += 1) {
				r = squaresToVisit[i][0];
				f = squaresToVisit[i][1];
				//testSquare = board.getSquare(r, f);
				// friction is 1 unless this is a water square, in which case 5
				friction = 1;
				for (j = 0; j < game.tiles.length; j += 1) {
					if (r === game.tiles[i].rank && f === game.tiles[i].file) {
						friction = 5;
						break;
					}
				}
	// 			friction = testSquare.friction;
	// 			// can't enter squares with undefined friction
	// 			if (friction === undefined) {
	// 				friction = 1000000000;
	// 			}
				// if we could enter this square
				if (rollValue >= friction) {
					// if we've already been to this square with an equal or higher fuel
					// we don't say we can enter
					possibleMove =	possibleMoves[r + ',' + f];
					if (possibleMove === undefined || possibleMove.remainingFuel < rollValue - friction) {
						possibleMoves[r + ',' + f] = { r: r, f: f, remainingFuel: rollValue - friction };
						// explore with this new, higher roll value
						canEnterSquares.push([ r, f, rollValue - friction ]);
					}
				}
			}
			return canEnterSquares;
		}

		function getPossibleMovesInternal(originatingSquares) {
			var i,
				length,
				squaresToVisit,
				canEnterSquares;

			for (i = 0, length = originatingSquares.length; i < length; i += 1) {
				squaresToVisit = adjacentHexTiles(originatingSquares[i][0], originatingSquares[i][1]);
				canEnterSquares = getCanEnterSquares(squaresToVisit, originatingSquares[i][2]);
				getPossibleMovesInternal(canEnterSquares);
			}
		}

		getPossibleMovesInternal([[r, f, rollvalue]]);
		return possibleMoves;
	}
		
	// add a tick count property to the emitter
	emitter.gameTick = 0;

	game.ranks = 20;
	game.files = 15;
	game.pieces = [{ rank: 0, file: 0, src: "pieceImages/sumo-wrestler.png" }];
	game.prizes =  [{ rank: 2, file:3, src: "prizeImages/key.png" },
						{ rank: 6, file: 5, src: "prizeImages/Chest-Closed.png" }];
	game.tiles =  [{ rank: 3, file: 10, src: "tileImages/water.png" }, 
					{ rank: 4, file: 10, src: "tileImages/water.png" },
					{ rank: 3, file: 11, src: "tileImages/water.png" }];

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
					console.log('it game over!');
					// tell the user it's over
					game.server_sendMessage('Time has run out!');
					// play a 'losing' sound here!
					game.server_playSound({ name: 'win.m4a', gain: 0.5 });
					// cancel all arrows
					progress.cancel();
					// cancel the tick interval
					stopTicking();
				});
				
		function canPlayerMoveTo(rank, file, points) {
			var possibleMoves = possibleMovesFromSquares(rank, file, points);
			return true;
		}
		
		// for starters, let the user move wherever they want, whenever
		var playerMovement = 
			ARR.ConstA(emitter)
				.then(ARR.ListenA('request-move-to'))
				.then(function (e) {
					var rank = e.rank,
						file = e.file;
						poss
					if (canPlayerMoveTo(rank, file, game.pieces[0].movementPoints)) {
						game.pieces[0].rank = rank;
						game.pieces[0].file = file;
						game.server_movePlayer(game.pieces[0]);
						game.server_playSound({ name: 'win.m4a', gain: 0.5 });
					} else {
						game.server_playSound({ name: 'win.m4a', gain: 0.5 });
					}
					return ARR.Repeat();
				})
				.repeat();
				
		var atStartOfGame = ARR.ConstA(new ARR.Pair(emitter, 0))
			.then(ARR.Listen2('start-game'))
			.then((function (points) {
				var newPoints = Math.floor(Math.random()*6) + 1;
				console.log('start player move points ', newPoints);
				game.pieces[0].movementPoints = newPoints;
				return newPoints;
			}).second());
		
		var everyThreeTicks = MYARR.DelayGameTicksA(3)
				.then((function (points) {
					var newPoints = Math.floor(Math.random()*6) + 1;
					game.pieces[0].movementPoints += newPoints;
					if (game.pieces[0].movementPoints > 12) {
						game.pieces[0].movementPoints = 12;
					}
					console.log('player move points ', game.pieces[0].movementPoints);
					return newPoints;
				}).second())
				.then(repeatTuple)
				.repeat();
		
		// lets have the player accumulate movement points every three seconds
		// but never more than 12
		var playerAccumulateMovementPoints = 
			atStartOfGame
			.then(everyThreeTicks);
			
		// fanout (run in parallel) the arrows we created	
		progress = countDown
			.fanout(timeoutGame)
			.fanout(playerMovement)
			.fanout(playerAccumulateMovementPoints)
			.run();
	}
	
	// create io
	game.gameIo = createGameIo(io, id, game);
	
	// get data to the client to configure the game
	game.connected = function(socket) {
		socket.emit('board', { ranks: game.ranks, 
			files: game.files, 
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