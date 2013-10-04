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

function createGame(id) {
	var game = {},
		emitter = new events.EventEmitter();
	
	// create io
	game.gameIo = createGameIo(io, id, game);
	
	// get data to the client to configure the game
	game.connected = function(socket) {
		var prizes = [{ rank: 2, file:3, src: "prizeImages/key.png" },
						{ rank: 6, file: 5, src: "prizeImages/Chest-Closed.png" }],
			pieces = [{ rank: 0, file: 0, src: "pieceImages/sumo-wrestler.png" }],
			tiles = [{ rank: 3, file: 10, src: "tileImages/water.png" }, 
				{ rank: 4, file: 10, src: "tileImages/water.png" },
				{ rank: 3, file: 11, src: "tileImages/water.png" }];

		socket.emit('board', { ranks: 20, 
			files: 15, 
			defaultImageURL: 'tileImages/grassField.png', 
			prizes: prizes, 
			pieces: pieces,
			tiles: tiles
		});

	};

	// handle incoming messages from client	
	game.startGame = function(data) {
		// start the game!
		console.log('user requested start game');
		game.server_sendMessage('The game has started!');
	};
	
	game.moveTo = function(data) {
		// can the user move here?
		console.log('user request move-to ', data);
		// did they land on a prize? increase points, remove prize, update points
		
	};
	
	game.server_movePlayer = function (to) {
		game.gameIo.namespace.emit('set-pieces', [{ name: 'player', 
			src: 'pieceImages/sumo-wrestler.png', 
			rank: to. r, 
			file: to.f 
		}]);
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