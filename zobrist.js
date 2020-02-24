const Zobrist = (function() {

	/*
	function randomUint32() {
		return window.crypto ? window.crypto.getRandomValues(new Uint32Array(1))[0] : (Math.random() * 4294967296) >>> 0;
	}
	function generate() {
		const maxWidth = 6;
		const maxHeight = 6;
		const pieces = 2;
		console.log("const zSide = " + randomUint32() + ";");
		console.log("const z = [];");
		for (var i = 0; i < maxWidth * maxHeight * pieces; i++) {
			console.log("z[" + i + "] = " + randomUint32() + ";");
		}
	}
	*/

	const zSide = 3721289436;
	const z = [];
	z[0] = 1039376408;
	z[1] = 1535527350;
	z[2] = 274467450;
	z[3] = 2058009610;
	z[4] = 1391472731;
	z[5] = 3877520283;
	z[6] = 4290754193;
	z[7] = 160764367;
	z[8] = 1967607057;
	z[9] = 3809332375;
	z[10] = 3780073428;
	z[11] = 1177550457;
	z[12] = 3271989805;
	z[13] = 3761672118;
	z[14] = 3223399139;
	z[15] = 422455954;
	z[16] = 810377988;
	z[17] = 2321468420;
	z[18] = 3633600050;
	z[19] = 246475245;
	z[20] = 1038628369;
	z[21] = 3458876925;
	z[22] = 2803083225;
	z[23] = 3758506861;
	z[24] = 1304736428;
	z[25] = 1542290836;
	z[26] = 1020883495;
	z[27] = 4202975127;
	z[28] = 4163133751;
	z[29] = 878770982;
	z[30] = 3995813073;
	z[31] = 3235328954;
	z[32] = 869292747;
	z[33] = 3203085589;
	z[34] = 4228040859;
	z[35] = 1269945446;
	z[36] = 2754251701;
	z[37] = 3681667726;
	z[38] = 2483705224;
	z[39] = 1813600571;
	z[40] = 1033613015;
	z[41] = 743111022;
	z[42] = 1187373429;
	z[43] = 3621629098;
	z[44] = 801933239;
	z[45] = 662148112;
	z[46] = 892452179;
	z[47] = 477390368;
	z[48] = 2448648817;
	z[49] = 2231930647;
	z[50] = 281851094;
	z[51] = 2326869911;
	z[52] = 807878494;
	z[53] = 2419747002;
	z[54] = 1374173265;
	z[55] = 2331758663;
	z[56] = 3263594605;
	z[57] = 1858486947;
	z[58] = 316080297;
	z[59] = 4088002672;
	z[60] = 309199203;
	z[61] = 1801289232;
	z[62] = 2140402210;
	z[63] = 2754684213;
	z[64] = 1995057582;
	z[65] = 1414435685;
	z[66] = 2088472807;
	z[67] = 1413189104;
	z[68] = 1391225710;
	z[69] = 1538148787;
	z[70] = 3921886443;
	z[71] = 959724411;

	function hashPosition(position, player) {
		return z[position * 2 + (player === Board.CONST.P1 ? 0 : 1)];
	}

	return {
		init: function(pieces, side) {
			var result = side === Board.CONST.P1 ? 0 : zSide;
			for (var player of [Board.CONST.P1, Board.CONST.P2]) {
				for (var piece of pieces[player]) {
					result ^= hashPosition(piece, player);
				}
			}
			return result >>> 0;
		},
		update: function(hashCode, move, side) {
			var result = hashCode ^ zSide;
			if (!Board.isPassMove(move)) {
				result ^= hashPosition(move.from, side) ^ hashPosition(move.to, side);
				for (var taken of move.taken) {
					result ^= hashPosition(taken, Board.opponentOf(side));
				}
			}
			return result >>> 0;
		}
	};
})();
