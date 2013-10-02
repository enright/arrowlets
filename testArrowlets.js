var Arr = require('./nodeArrowlets');
var DelayGameTicksA = require('./delayGameTicksA').DelayGameTicksA;
var events = require("events");

// an event emitter for a game
// serves as game clock
var gameEmitter = (function () {
	var emitter = new events.EventEmitter();
	// dependent on this value in the emitter for DelayGameTicksA
	emitter.gameTick = 0;
	// set to the event when an event is fired
	emitter.eventData = undefined;
	return emitter;
}());

// 3x3 board of values
var board = [ [1, 2, 3], [4, 5, 6], [7, 5, 8] ];
// each array entry is row, col, new value
var boardChanges = [ { r: 0, c: 1, value: 9 }, { r: 2, c: 2, value: 10 } ];
	
// create a function 'playerCanTakeChest' that changes the game setting
// from the value in the arrow (which is passed in - and the arrow value is initially false)
// and returns the new value (which will be put in the arrow)
var gameSettings = { canTakeChest: false };

var playerCanTakeChest = (function (gameSettings) {
	return function (canTake) {
		gameSettings.canTakeChest = !canTake;
		return !canTake;
	};
}(gameSettings));

// when the player takes the chest we have to do stuff
// lift this tuple-aware function into an arrow
var playerTookChest = (function (pair) {
    var eventData = pair.fst().eventData,
    	canTake = pair.snd();
    
    // check in case somehow someone already took it
    if (canTake) {
		console.log('player ' + eventData.playerName + ' got the chest!');
		// do other work here to remove the chest from the game
	}
	
	// no one can take it
	pair.snd(false);
	return pair;
}).Arr();


// create an arrow to handle chest and key behavior
var chestAndKey =
	Arr.ConstA(new Arr.Pair(gameEmitter, gameSettings.canTakeChest))
		// listen for the event of the user taking the key
		.then(Arr.ListenWithValueA('takePrize', 'prizeName', 'key'))
		// then flip the take chest flag
		.then(playerCanTakeChest.second())
		// this is just a log message
		.then((function (x) { console.log('can take chest ', x); return x; }).second())
		// then run either time running out or user taking the chest
		.then((Arr.DelayA(6000)
				// flip the take ches flag in 6 seconds
				.then(playerCanTakeChest.second())
				.then((function (x) { console.log('can take chest ', x); return x; }).second()))
			// or the user got the chest and process that
			.or(Arr.ListenWithValueA('takePrize', 'prizeName', 'chest')
				.then(playerTookChest)));

// tuple-aware repeat, used for unending loops
var repeatTuple = (function (tuple) { return Arr.Repeat(tuple); }).Arr();

function applyChanges(board, changes) {
	var i,
		length = changes.length,
		restore = [];
	console.log('changes ', changes);
	for (i = 0; i < length; i += 1 ) {
		restore[i] = { r: changes[i].r, c: changes[i].c, value: board[changes[i].r][changes[i].c] };		
		board[changes[i].r][changes[i].c] = changes[i].value;
	}
	console.log('restore ', restore);
	return restore;
}

// apply changes to the board and return the original tile values
// the board is 'in' the closure of the returned function
var boardTileChange = (function (board) {
	return function (changes) {
		return applyChanges(board, changes);
	};
}(board));
		
// create a board tile changing arrow
var boardTileChanges =
	Arr.ConstA(new Arr.Pair(gameEmitter, boardChanges))
		// wait a second after start
		.then(DelayGameTicksA(1))
		// then change the tiles
		.then(boardTileChange.second())
		// waith three seconds
		.then(DelayGameTicksA(3))
		// and change them back
		.then(boardTileChange.second())
		// repeat this forever
		.then(repeatTuple)
		.repeat();
	
// fanout (run in parallel) the two arrows we created	
progress = boardTileChanges
	.fanout(chestAndKey)
	.run();
	
// a game using a nodejs event emitter
// emits events at specific intervals
var game = (function (emitter, progress) {
	var anEmitter = emitter;
	emitter.gameTick = 0;
	var tick = 0;
	
	// every second, emit this event
	var oneCanceller = setInterval(function () {
		tick += 1;
		console.log('tick ', tick);
		emitter.gameTick = tick;
		anEmitter.emit('tick', { tick: tick });
	}, 1000);	
	
	// every three seconds emit this event
	var twoCanceller = setInterval(function () {
		anEmitter.emit('two', { two: 'hello', tick: tick });
	}, 3000);
	
	var gotKey = setInterval(function () {
		anEmitter.emit('takePrize', { playerName: 'Dave', prizeName: 'key'});
	}, 2000);
	
	var gotChest = setInterval(function () {
		anEmitter.emit('takePrize', { playerName: 'Tony', prizeName: 'chest' });
	}, 6000);
	
	// stop the game at ten seconds.
	// cancel the intervals
	// cancel the game arrow
	setTimeout(function () {
		clearInterval(oneCanceller);
		clearInterval(twoCanceller);
		clearInterval(gotKey);
		clearInterval(gotChest);
		progress.cancel();
	}, 10000);
}(gameEmitter, progress));

