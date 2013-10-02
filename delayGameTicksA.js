var Arr = require('./nodeArrowlets');

// create our own arrow for delaying a certain number of game ticks
function DelayGameTicksA(ticks) {
    if (!(this instanceof DelayGameTicksA))
        return new DelayGameTicksA(ticks);
    this.delayTicks = ticks;
}
DelayGameTicksA.prototype = new Arr.AsyncA(function (pair, a) {

    var delayTicks = this.delayTicks,
    	emitter = pair.fst(),
    	beginTick = emitter.gameTick;
	
	// cancel just removes the listener from the emitter
    var cancel = function () {
        emitter.removeListener('tick', listener);
    }
    
    var listener = function (event) {
    	// check the property on the event and see if it is the value we're looking for
    	if (beginTick + delayTicks < event.tick) {
    		emitter.eventData = event;
			cancel();
			a.advance(cancel);
			a.cont(pair);
        }
    }
      
    a.addCanceller(cancel);
    emitter.addListener('tick', listener);
});

exports.DelayGameTicksA = DelayGameTicksA;