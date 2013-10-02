var Arr = require('./nodeArrowlets');
var events = require("events");

// an event emitter
var emitter = new events.EventEmitter();

// 3x3 board of values
var board = [ [1, 2, 3], [4, 5, 6], [7, 5, 8] ];
// each array entry is row, col, new value
var boardChanges = [ { r: 0, c: 1, value: 9 }, { r: 2, c: 2, value: 10 } ];

// need the board coming from somewhere
// var boardA = Arr.ConstA(board);
// function doom(boardChanges) {
// 	// change the board
// 	
// 	return originalBoardValues;
// }
// 
// function waitGameSeconds(secs) {
// 	return Arr.ListenWithValueA('tick', 'tick', secs);
// }

	
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

// we start off this arrow with the current canTakeChest value from the game settings
// we listen (perhaps forever) for the player to take the key
// we flip the setting if they do - we log a little message
// then the user has 4 seconds to get the chest
// we flip the setting after 4 seconds and log a little message
// then this arrow is done
var chestAndKey =
	Arr.ConstA(new Arr.Pair(emitter, gameSettings.canTakeChest))
		.then(Arr.ListenWithValueA('takePrize', 'prizeName', 'key'))
		.then(playerCanTakeChest.second())
		.then((function (x) { console.log('can take chest ', x); return x; }).second())
		.then((Arr.DelayA(6000)
			.then(playerCanTakeChest.second())
			.then((function (x) { console.log('can take chest ', x); return x; }).second()))
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


// we'll kick off the arrow with the emitter and changes to the board
// in this case, we have made the data part of the arrow
var boardTileChanges =
	Arr.ConstA(new Arr.Pair(emitter, boardChanges))
		.then(Arr.ListenA('tick'))
		.then(boardTileChange.second())
		.then(Arr.ListenA('two'))
		.then(boardTileChange.second())
		.then(repeatTuple)
		.repeat();

progress = boardTileChanges
	.fanout(chestAndKey)
	.run();

// we'll kick off the arrow with the emitter and changes to the board
// in this case the data fed to the arrow is passed into run
// var progress =
// 	ListenA('tick')
// 		.then(boardTileChange.second())
// 		.then(ListenA('two'))
// 		.then(boardTileChange.second())
// 		.then(repeatTuple)
// 		.repeat()
// 		.run(new Pair(emitter, boardChanges));
		


// a game using a nodejs event emitter
// emits events at specific intervals
var game = (function (emitter, progress) {
	var anEmitter = emitter;
	var tick = 0;
	
	// every second, emit this event
	var oneCanceller = setInterval(function () {
		tick += 1;
		console.log('tick ', tick);
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
}(emitter, progress));

