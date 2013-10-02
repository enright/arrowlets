var Arr = require('./nodeArrowlets');
var events = require("events");

// an event emitter
var emitter = new events.EventEmitter();
// var listenForOne = Arr.ListenA('one');
// 
// // arrow to deliver an emitter
// var emitterA = Arr.ConstA(emitter);
// // arrows to take an action when the event happens
// var listenToOne = emitterA.next(Arr.ListenA('tick')).next(function () { console.log('one called'); });
// var listenToTwo = emitterA.next(Arr.ListenA('two')).next(function () { console.log('two called'); });

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

// waters of doom
// ConstA(emitter)
// 	// delivers data after waiting 4 game seconds
// 	.then(GameSecondsA(boardChanges, 4))
// 	.then(function (boardChanges) { console.log('got tick event with e.tick value of ', e.tick); })
// 	.then(GameSeconds(4))
// 	.then(function (
// 	.run();

	
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
		.then(Arr.DelayA(4000))
		.then(playerCanTakeChest.second())
		.then((function (x) { console.log('can take chest ', x); return x; }).second())
		.run();

// // another running arrow for the chest
// // see how we get the event with ListenWithValueA and it is passed to the lifted function
// // which sets userCanTakeChest(true)
// // because we return the event, DelayA carries it through to the next function
// // where we set userCanTakeChest(false)
// ConstA(emitter)
// 	// listen for user taking the key prize
// 	.then(ListenWithValueA('takePrize', 'prizeName', 'key'))
// 	// set the user can take value and return the input event as the output
// 	.then(function (e) { console.log('got the key ', e); userCanTakeChest(true); return e; })
// 	// delay 4 seconds, then pass along output from previous as input to next
// 	.then((DelayA(4000).next(function (e) { console.log('event after delay ', e); userCanTakeChest(false); }))
// 		.or(ConstA(emitter).then(ListenWithValueA('takePrize', 'prizeName', 'chest'))
// 			.then(function () { console.log('got the chest'); })))
// 	.run();
// 
// 	
// // create a game that will be cancelled (with 10 ticks, the last three 'listenToTwo' never execute)
// var progress = emitterA
// 	.next(listenToOne.fanout(listenToTwo))
// 	.next(function() { console.log('one and two called'); }) // these two must complete before next is executed
// 	.next(listenToOne)
// 	.next(listenToTwo.or(listenToOne))
// 	.next(listenToTwo)
// 	.next(listenToTwo)
// 	.next(listenToTwo)
// 	.next(listenToTwo)
// 	.run();
// 	
// // run F (emitterA) which delivers f(x) (emitter)
// // join runs G (ListenerA('one')) with the value f(x) (the emitter) and returns g(f(x)) which is the event
// //   but it retuns a TUPLE, the first in the tuple is the emitter, the second in the tuple is g(f(x)) (the event)
// // then runs an arrow that is our function applied to the SECOND element in the tuple
// // it returns a TUPLE which still has the emitter as the first element! but has the value '27 as the second
// // then we run ListenerA('two') on the first element of the tuple (the emitter)
// // finally we run another function on the second element of the tuple
// // the output result is a tuple of emitter and the event
// // so second should deliver the event
// var skip = emitterA
// 	// runs listener with emitter and produces a tuple with { first: emitter, second: event }
// 	.join(ListenA('tick'))
// 	// next run a function over the second element in the tuple (the event)
// 	// and produce a new tuple { first: emitter,  second: 27 }
// 	.then((function(x) { console.log('responding to the event ', x); return 27; }).second())
// 	// run listener over the emitter and produce a tuple with event, 27
// 	.then(ListenA('two').first())
// 	// run a function over 27
// 	.then((function(x) { console.log('restore the data ', x); }).second());
// console.log(skip.toAString());
// skip.run();

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
var progress =
	Arr.ConstA(new Arr.Pair(emitter, boardChanges))
		.then(Arr.Listen2('tick'))
		.then(boardTileChange.second())
		.then(Arr.Listen2('two'))
		.then(boardTileChange.second())
		.then(repeatTuple)
		.repeat()
		.run();

// we'll kick off the arrow with the emitter and changes to the board
// in this case the data fed to the arrow is passed into run
// var progress =
// 	Listen2('tick')
// 		.then(boardTileChange.second())
// 		.then(Listen2('two'))
// 		.then(boardTileChange.second())
// 		.then(repeatTuple)
// 		.repeat()
// 		.run(new Pair(emitter, boardChanges));
		
// create an arrow that continuously repeats
// changing board values and changing them back
// var wave =
// 	ConstA(new Pair(emitter, boardChanges))
// 		.then(Listen2('tick'))
// 		.then(boardTileChange.second())
// 		.then(Listen2('two'))
// 		.then(boardTileChange.second())
// 		.then(repeatTuple)
// 		.repeat();

// var progress = 
// 	(Listen2('tick')
// 	//.then((function tupleAware(tuple) { console.log('tuple ', tuple); return tuple; }).Arr())
// 	.then((function(x) { console.log('responding to the event ', x); return 27; }).second())
// 	//.then((function tupleAware(tuple) { console.log('tuple ', tuple); return tuple; }).Arr())
// 	.then(Listen2('two'))
// 	//.then((function tupleAware(tuple) { console.log('tuple ', tuple); return tuple; }).Arr())
// 	.then((function(x) { console.log('restore the data ', x); return 14; }).second())
// 	.then((function tupleAware(tuple) { console.log('tuple ', tuple); return tuple; }).Arr())
// 	.then((function tupleAware(tuple) { return Repeat(tuple); }).Arr()))
// 	.repeat()
// ;
// 
// progress.run(new Pair(emitter, doom));

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
		anEmitter.emit('takePrize', { prizeName: 'key'});
	}, 2000);
	
	var gotChest = setInterval(function () {
		anEmitter.emit('takePrize', { prizeName: 'chest' });
	}, 11000);
	
	// stop the game at ten seconds.
	// cancel the intervals
	// cancel the game arrow
	setTimeout(function () {
		clearInterval(oneCanceller);
		clearInterval(twoCanceller);
		clearInterval(gotKey);
		clearInterval(gotChest);
		progress.cancel();
		console.log('user can take chest ', gameSettings.canTake);
	}, 10000);
}(emitter, progress));

console.log('user can take chest ', gameSettings.canTake);

//emitterA.next(listenToOne.fanout(listenToTwo)).run();
//emitterA.next(listenToOne.or(listenToTwo)).run();
