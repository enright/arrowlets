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

$(function () {


	//+ Jonas Raoni Soares Silva
	//@ http://jsfromhell.com/math/is-point-in-poly [rev. #0]
	function isPointInPoly(poly, pt) {
		var c,
			i,
			l,
			j;
		for (c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i) {
			((poly[i].y <= pt.y && pt.y < poly[j].y) || (poly[j].y <= pt.y && pt.y < poly[i].y))
				&& (pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)
				&& (c = !c);
		}
		return c;
	}

	// test for point inside a hex (presumes top left height width describe
	// a hex with "flat" top and bottom along top and bottom of the rect)
	function isHexIn(clickY, clickX, top, left, height, width) {
		return isPointInPoly([{x: left + width / 4, y: top}, {x: left + (width * 3) / 4, y: top}, {x: left + width, y: top + height / 2},
			{x: left + (width * 3) / 4, y: top + height}, {x: left + width / 4, y: top + height}, {x: left, y: top + height / 2}],
			{ x: clickX, y: clickY });
	}


	//handles clicks on the map
	function handleClick(e) {
		// if this is a prize of decoration image,
		// delegate handling the click to the terrain image
		var layer = $(e.target).attr('data-layer'),
			rank = $(e.target).attr('data-rank'),
			file = $(e.target).attr('data-file');

		// was an element clicked?
		function wasMoveClick(element) {
			var offset = $(element).offset();
			return isHexIn(e.pageY, e.pageX, offset.top, offset.left, element.height, element.width);
		}

		function thenMoveTo(r, f) {
			socket.emit('move-to', { rank: r, file: f });
		}

		// get the list item for a rank and file.
		// the map is represented as a single list.
		function getMapListItem(r, f) {
			var rowClass = 'b-rank-' + r,
				fileClass = 'b-file-' + f,
				$element =  $('li.b.' + rowClass + '.' + fileClass);
			return $element;
		}

		// get the terrain image in the map for a rank and file.
		function getMapImage(r, f) {
			var $element =  getMapListItem(r, f);
			return $element.children('img').first();
		}

		// because we align along the top
		// we can never confuse a click in a tile
		// with the tile above or below it
		// so we check tiles left and right
		function checkNearNeighbors(r, f) {
			var neighbor,
				leftFile = r % 2 === 0  ? f : f - 1, // even rows to the left is same file, odd rows it's previous file
				rightFile = r % 2 === 0 ? f + 1 : f; // even rows to the right is next file, odd rows it is same file
			// check each
			// above left
			neighbor = getMapImage(r - 1, leftFile);
			if (neighbor.length > 0 && wasMoveClick(neighbor[0])) {
				thenMoveTo(r - 1, leftFile);
				return;
			}
			// below left
			neighbor = getMapImage(r + 1, leftFile);
			if (neighbor.length > 0 && wasMoveClick(neighbor[0])) {
				thenMoveTo(r + 1, leftFile);
				return;
			}
			// above right
			neighbor = getMapImage(r - 1, rightFile);
			if (neighbor.length > 0 && wasMoveClick(neighbor[0])) {
				thenMoveTo(r - 1, rightFile);
				return;
			}
			// below right
			// is there a tile below?
			neighbor = getMapImage(r + 1, rightFile);
			if (neighbor.length > 0 && wasMoveClick(neighbor[0])) {
				thenMoveTo(r + 1, rightFile);
				return;
			}
		}

		if (wasMoveClick(e.target)) {
			// then we move there
			thenMoveTo(rank, file);
		} else { // else check nearest neighbors
			checkNearNeighbors(rank, file);
		}
	}

	var socket = io.connect('http://localhost:3000' + $('#gameSettings').attr('gameId'));
	
	socket.on('text-message', function (data) {
		$('#message').text(data);
	});	
	
	function setTiles(tiles) {
		var i,
			tilesLength = tiles.length;
			
		for (i = 0; i < tilesLength; i += 1) {
			// get the list item for this rank and file
			li = $('li.b-rank-' + tiles[i].rank + '.b-file-' + tiles[i].file)
				.children('img').first().attr('src', tiles[i].src);
		}
	}
	
	socket.on('set-tiles', setTiles);

	function classesArrayToString(classArray) {
		var i,
			length,
			classes = '';
		for (i = 0, length = classArray.length; i < length; i += 1) {
			classes += ' ' + classArray[i];
		}
		return classes;
	}
		
	function setPieces(pieces) {
		var i,
			piecesLength = pieces.length,
			li,
			pieceImage,
			regClasses;
			
		for (i = 0; i < piecesLength; i += 1) {
			// get the list item for this rank and file
			li = $('li.b-rank-' + pieces[i].rank + '.b-file-' + pieces[i].file);
			// we want to re-use the classes on the first img in the li
			regClasses = li.children('img').first().attr('class').match(/b-[^ ]+/g);
			pieceImage = $(document.createElement("img"))
							.attr({ 'data-name': pieces[i].name, 
								src: pieces[i].src, 
								'data-layer': 'piece', 
								style: 'pointer-events:none; z-index: 3' 
							})
							.addClass(classesArrayToString(regClasses));				
			li.append(pieceImage);
		}
	};
		
	socket.on('set-pieces', setPieces);

	function removePieces(pieces) {
		var i,
			piecesLength = pieces.length;
			
		for (i = 0; i < piecesLength; i += 1) {
			$('li.b-rank-' + pieces[i].rank + '.b-file-' + pieces[i].file)
				.find('img[data-name=\"'+pieces[i].name + '\"]').remove();
		}
	}	
		
	socket.on('remove-pieces', removePieces);
	
	function setPrizes(prizes) {
		var i,
			prizesLength = prizes.length,
			li,
			prizeImage,
			regClasses;
			
		for (i = 0; i < prizesLength; i += 1) {
			// get the list item for this rank and file
			li = $('li.b-rank-' + prizes[i].rank + '.b-file-' + prizes[i].file);
			// we want to re-use the classes on the first img in the li
			regClasses = li.children('img').first().attr('class').match(/b-[^ ]+/g);
			prizeImage = $(document.createElement("img"))
							.attr({ src: prizes[i].src, 
								'data-layer': 'prize', 
								style: 'pointer-events:none; z-index: 2' 
							})
							.addClass(classesArrayToString(regClasses));				
			li.append(prizeImage);
		}
	};
	
	socket.on('set-prizes', setPrizes);
	
	function removePrizes(prizes) {
		var i,
			prizesLength = prizes.length;
			
		for (i = 0; i < prizesLength; i += 1) {
			$('li.b-rank-' + prizes[i].rank + '.b-file-' + prizes[i].file)
				.find('img[src=\"'+prizes[i].src + '\"]').remove();
		}
	}
	
	socket.on('remove-prizes', removePrizes);
	
	socket.on('one-shot-sound', function (sound) {
		// create and play
		var am = audioMonad()
				.masterGain(sound.gain)
				.setAudioBuffers(loadAudio.getAudioBuffers())
				.play(sound.name);
	});
	
	socket.on('play-sound-at', function (sound) {
		// located sound, possily repeating
	});
	
	socket.on('stop-sound', function (sound) {
		// stop whatever no effect if no sound
	});
	
	socket.on('board', function (data) {

		// build the board
		var map = myhextemplate({
			ranks: data.ranks,
			files: data.files,
			width: 48,
			height: 48,
			defaultImageURL: data.defaultImageURL,
			divClass: 'mydumbdiv',
			boardClass: 'b'
		});
		$('#ourCoolMap').empty();
		$('#ourCoolMap').append(map);
		// put attribute into tile image elements to indicate rank, file, layer and z-index
		$('li.b').each(function (index, element) {
			$(element).children('img').first().attr({ 'data-rank': Math.floor(index / data.files), 
				'data-file': index % data.files, 
				'data-layer': 'tile', 
				style:'z-index:1'
			});
		});
		// attach click-handler on all the tiles
		$('#ourCoolMap').find('img').click(handleClick);

		if (data.tiles) {
			setTiles(data.tiles);
		}
		
		if (data.prizes) {
			setPrizes(data.prizes);
		}
		
		if (data.pieces) {
			setPieces(data.pieces);
		}
		
// 		var testPrize = [{ rank: 8, file: 2, src: 'prizeImages/key.png'}];
// 		setPrizes(testPrize);
// 		removePrizes(testPrize);
// 		
// 		var testPiece = [{ rank: 8, file: 2, src: 'pieceImages/monster.png', name: 'bill'}];
// 		setPieces(testPiece);
// 		removePieces(testPiece);
		
		$('#startGame').click(function () {
			socket.emit('start-game');
		});
		
	});
	
	// use the audio monad to create buffers from the pre-loaded sound URIs
	var loadAudio = audioMonad();
	for (sound in sounds) {
		if (sounds.hasOwnProperty(sound)) {
			loadAudio.addSoundDataURI(sound, sounds[sound]);
		}
	}
			
});




