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