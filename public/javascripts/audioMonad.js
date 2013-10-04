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

var audioMonad = (function (tweaks) {
	// create monad constructor
	// every audio monad uses the same audio context
	// but if there isn't one...nothing happens
	var ContextConstructor = window.AudioContext || window.webkitAudioContext,
		audioContext = ContextConstructor && new ContextConstructor(),
		audioMonad = MONAD(function (monad, value) {
			// if we don't have an audio context
			if (!audioContext) {
				// then there is nothing to do ever, so replace bind
				monad.bind = function () {
					return monad;
				};
			}
			if (typeof tweaks === 'function') {
				tweaks(monad, value);
			}
		});

	/*
	 * ADAPETED FROM
	 * base64-arraybuffer
	 * https://github.com/niklasvh/base64-arraybuffer
	 *
	 * Copyright (c) 2012 Niklas von Hertzen
	 * Licensed under the MIT license.
	 */
	function base64ToArrayBuffer(base64) {	
		var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
			bufferLength = base64.length * 0.75,
			len = base64.length,
			i,
			p = 0,
			encoded1,
			encoded2,
			encoded3,
			encoded4;

		if (base64[base64.length - 1] === "=") {
			bufferLength--;
			if (base64[base64.length - 2] === "=") {
				bufferLength--;
			}
		}

		var arraybuffer = new ArrayBuffer(bufferLength),
		bytes = new Uint8Array(arraybuffer);

		for (i = 0; i < len; i+=4) {
			encoded1 = chars.indexOf(base64[i]);
			encoded2 = chars.indexOf(base64[i+1]);
			encoded3 = chars.indexOf(base64[i+2]);
			encoded4 = chars.indexOf(base64[i+3]);

			bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
			bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
			bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
		}

		return arraybuffer;
	};
  
	// setAudioBuffers - set the available audio buffers
	// copy the references into a new object
	audioMonad.lift('setAudioBuffers', function (value, buffers) {
		var copyBuffers = {},
			i,
			numBuffersInId;
			
		for (id in buffers) {
			if (buffers.hasOwnProperty(id)) {
				numBuffersInId = buffers[id].length;
				if (numBuffersInId > 0) {
					copyBuffers[id] = []
				}
				for (i = 0; i < numBuffersInId; i += 1) {
					copyBuffers[id][i] = buffers[id][i];
				}
			}
		}
		// replace the buffers, keep master gain if it is there
		return { audioBuffers: copyBuffers, masterGain: value && value.masterGain }
	});

	// getAudioBuffers - get the available audio buffers
	// note 'lift_value' - does not return a monad
	audioMonad.lift_value('getAudioBuffers', function (value) {
		// get the buffers
		return value.audioBuffers;
	});

	// masterGain - create master gain with an optional initial volume
	audioMonad.lift('masterGain', function (value, initialVolume) {
		var masterGain = audioContext.createGain();
		masterGain.connect(audioContext.destination);
		masterGain.gain.value = initialVolume || 1;
		// keep the buffers, set master gain
		return { audioBuffers: value && value.audioBuffers, masterGain: masterGain };
	});

	// play - select a sound from the audio buffers and play it now
	audioMonad.lift('play', function (value, id, index) {
		if (value && value.audioBuffers && value.masterGain) {
			var audioSource = audioContext.createBufferSource();
			if (index === undefined) {
				index = 0;
			}
			audioSource.buffer = value.audioBuffers[id][index];
			audioSource.connect(value.masterGain);
			audioSource.start(0);
		}
		// keep buffers and master gain
		return { audioBuffers: value && value.audioBuffers, masterGain: value && value.masterGain }
	});

	// clearSound - remove a sound by id. modifies the value 'in place'
	audioMonad.lift('clearSound', function (value, id) {
		if (value.audioBuffers) {
			if (value.audioBuffers[id]) {
				delete value.audioBuffers[id];
			}
		}
		return value;
	});
	
	// addSoundDataURI - add a sound to the buffer list - decode it
	// mutliple sounds can be added for a single id
	audioMonad.lift('addSoundDataURI', function (value, id, data, callback) {
		if (!value.audioBuffers) {
			value.audioBuffers = {};
		}
		if (!value.audioBuffers[id]) {
			value.audioBuffers[id] = [];
		}
		var count = value.audioBuffers[id].length;
		value.audioBuffers[id].push('pending');
		var buff = base64ToArrayBuffer(data.split(',')[1]);
		var audioDecodedSuccess = (function (id, index) {
			return function (audioData) {
				value.audioBuffers[id][index] = audioData;
				if (callback) {
					callback();
				}
			};
		}(id, count));
		var audioDecodedFailed = (function (id, index) {
			return function () {
				value.audioBuffers[id][index] = 'failed';
				console.log('failed to decode audio ', id, ' ', index);
			};
		}(id, count));
		
		audioContext.decodeAudioData(buff, audioDecodedSuccess, audioDecodedFailed);			
		// keep buffers and master gain
		return { audioBuffers: value && value.audioBuffers, masterGain: value && value.masterGain }
	});

	// create a sound source at a location
	// id can be 'listener', otherwise an id for the sound source
	audioMonad.lift('locate', function (value, id, x, y, z) {
		x = x || 0.0;
		y = y || 0.0;
		z = z || 0.0;
		if (!value.panners) {
			value.panners = {};
		}
		if (!value.panners[id]) {
			if (id === 'listener') {
				value.panners[id] = audioContext.listener;
			} else {
				value.panners[id] = audioContext.createPanner();
			}
		}
		value.panners[id].setPosition(x, y, z);
		return value;
	});

	// orient a sound source at a location
	// 0,0,0 is omnidirectional
	audioMonad.lift('orient', function (value, id, x, y, z) {
		x = x || 0.0;
		y = y || 0.0;
		z = z || 0.0;
		if (value.panners && value.panners[id]) {
			value.panners[id].setOrientation(x, y, z);
		}
		return value;
	});
	
	// sound cone
	audioMonad.lift('cone', function (value, id, innerAngle, outerAngle, outerGain) {
		innerAngle = innerAngle || 360.0;
		outerAngle = outerAngle || 360.0;
		outerGain = outerGain || 0.0;
		if (value.panners && value.panners[id] && id !== 'listener') {
			value.panners[id].coneInnerAngle(innerAngle);
			value.panners[id].coneOuterAngle(outerAngle);
			value.panners[id].coneOuterGain(outerGain);
		}
		return value;
	});
	
	return audioMonad;
}());

// var alternator = audioMonad(function(monad, value) {
// 	if (value.alt) {
// 		value.alt += 1;
// 		value.alt = value.alt % 3;
// 	} else {
// 		value.alt = 0;
// 	}
// });
// alternator.lift('alternateSound', function (value) {
// 	buffer = value.audioBuffers[value.alt];
// 	
// });