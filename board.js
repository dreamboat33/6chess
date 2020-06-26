const Board = (function() {

	const P1 = 1, P2 = 2;
	const MATE_BASE = 99000, MATE_SCORE = 99999;
	const FLIP_NULL = 0, FLIP_H = 1, FLIP_V = 2;

	const MAX_REPETITION = 2;
	var   MAX_TABLE_SIZE = 50000;
	const COLD_TABLE_PERCENTAGE = 0.7;
	const MIN_SEARCH_DEPTH = 1;
	const BASE_SEARCH_DEPTH = 4;

	const YIELD_INTERVAL = 300;

	const VARIANTS = {
		"1": {
			name: "4x4",
			width: 4,
			height: 4,
			board: function() {
				return	[P2,P2,P2,P2,
						 P2, 0, 0,P2,
						 P1, 0, 0,P1,
						 P1,P1,P1,P1];
			},
			heuristic: function(board) {
				const HEURISTIC = {
					 5: [0, 20, -10],
					 6: [0, 20, -10],
					 9: [0, 10, -20],
					10: [0, 10, -20]
				};
				return HEURISTIC[5][board[5]]
						+ HEURISTIC[6][board[6]]
						+ HEURISTIC[9][board[9]]
						+ HEURISTIC[10][board[10]];
			}
		},
		"2": {
			name: "5x4",
			width: 5,
			height: 4,
			board: function() {
				return	[P2,P2,P2,P2,P2,
						 P2, 0, 0, 0,P2,
						 P1, 0, 0, 0,P1,
						 P1,P1,P1,P1,P1];
			},
			heuristic: function(board) {
				const HEURISTIC = {
					 6: [0, 11, -9],
					 7: [0, 11, -9],
					 8: [0, 11, -9],
					11: [0, 9, -11],
					12: [0, 9, -11],
					13: [0, 9, -11]
				};
				return HEURISTIC[6][board[6]]
						+ HEURISTIC[7][board[7]]
						+ HEURISTIC[8][board[8]]
						+ HEURISTIC[11][board[11]]
						+ HEURISTIC[12][board[12]]
						+ HEURISTIC[13][board[13]];
			}
		},
		"3": {
			name: "5x5",
			width: 5,
			height: 5,
			board: function() {
				return	[P2,P2,P2,P2,P2,
						 P2, 0, 0, 0,P2,
						  0, 0, 0, 0, 0,
						 P1, 0, 0, 0,P1,
						 P1,P1,P1,P1,P1];
			},
			heuristic: function(board) {
				const HEURISTIC = {
					 6: [0, 12, -8],
					 7: [0, 12, -8],
					 8: [0, 12, -8],
					11: [0, 10, -10],
					12: [0, 20, -20],
					13: [0, 10, -10],
					16: [0, 8, -12],
					17: [0, 8, -12],
					18: [0, 8, -12]
				};
				return HEURISTIC[6][board[6]]
						+ HEURISTIC[7][board[7]]
						+ HEURISTIC[8][board[8]]
						+ HEURISTIC[11][board[11]]
						+ HEURISTIC[12][board[12]]
						+ HEURISTIC[13][board[13]]
						+ HEURISTIC[16][board[16]]
						+ HEURISTIC[17][board[17]]
						+ HEURISTIC[18][board[18]];
			}
		}
	};

	const PASS_MOVE = { from: null };

	function _augmentMateScore(score, ply) {
		return score >= MATE_BASE ? score - ply : score <= -MATE_BASE ? score + ply : score;
	}

	function _augmentLoopScore(score) {
		if (score == 0) return 0;
		var n = Math.floor(Math.abs(score / 100));
		return (score < 0 ? -1 : 1) * (n < 1 ? 1 : n > 4 ? 4 : n);
	}

	function _opponent(side) {
		return P1 + P2 - side;
	}

	// Board
	function Board(variant, board, side) {
		this.variant = variant || "1";
		if (VARIANTS[this.variant] == null) throw new Error("Unknown variant " + this.variant);

		this.width = VARIANTS[this.variant].width;
		this.height = VARIANTS[this.variant].height;
		this.board = board || VARIANTS[this.variant].board();
		this.pieces = [];
		this.pieces[P1] = [];
		this.pieces[P2] = [];
		for (var i = 0; i <= this.width * this.height; i++) {
			for (var player of [P1, P2]) {
				if (this.board[i] == player) {
					this.pieces[player].push(i);
					break;
				}
			}
		}
		this.side = side || P1;

		this.flip = null;
		this.hash = Zobrist.init(this.pieces, this.side);
	}

	Board.prototype._checkFlip = function() {
		if (this.flip != null) return;
		this.flip = [];
		this.flip[FLIP_NULL] = true;
		dirLoop: for (var dir of [FLIP_H, FLIP_V]) {
			this.flip[dir] = true;
			for (var player of [P1, P2]) {
				for (var piece of this.pieces[player]) {
					if (this.board[this._flipPiece(piece, dir)] != player) {
						this.flip[dir] = false;
						continue dirLoop;
					}
				}
			}
		}
	};

	Board.prototype.play = function(move) {
		var old = this.hash;
		this.hash = Zobrist.update(this.hash, move, this.side);

		if (Board.isPassMove(move)) {
			this.side = _opponent(this.side);
			return;
		}

		this.board[move.to] = this.side;
		this.board[move.from] = 0;
		this.pieces[this.side][this.pieces[this.side].indexOf(move.from)] = move.to;

		this.side = _opponent(this.side);
		for (var taken of move.taken) {
			this.board[taken] = 0;
			this.pieces[this.side][this.pieces[this.side].indexOf(taken)] = this.pieces[this.side][this.pieces[this.side].length - 1];
			this.pieces[this.side].pop();
		}
		this.flip = null;
	};

	Board.prototype.unplay = function(move) {
		this.hash = Zobrist.update(this.hash, move, _opponent(this.side));

		if (Board.isPassMove(move)) {
			this.side = _opponent(this.side);
			return;
		}

		for (var taken of move.taken) {
			this.board[taken] = this.side;
			this.pieces[this.side].push(taken);
		}

		this.side = _opponent(this.side);
		this.board[move.to] = 0;
		this.board[move.from] = this.side;
		this.pieces[this.side][this.pieces[this.side].indexOf(move.to)] = move.from;
		this.flip = null;
	};

	Board.isPassMove = function(move) {
		return move.from == null;
	};

	Board.isSameMove = function(move1, move2) {
		return move1.from === move2.from && move1.to === move2.to;
	};

	Board.prototype.moves = function() {
		var moves = [], inferiorMoveStartIndex = 0, oppo = _opponent(this.side);
		for (var p of this.pieces[this.side]) {
			var x = p % this.width;
			var y = p / this.width | 0;
			this._checkFlip();
			if (this.flip[FLIP_H] && x >= this.width / 2) continue;
			if (this.flip[FLIP_V] && y >= this.width / 2) continue;

			for (var dir of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				var dx = dir[0], dy = dir[1];
				if (this._get(x + dx, y + dy) == 0) {
					var taken = [];
					if (this._get(x + 2 * dx, y + 2 * dy) == this.side && this._get(x + 3 * dx, y + 3 * dy) == oppo && this._get(x + 4 * dx, y + 4 * dy) <= 0) {
						taken.push(this._toIndex(x + 3 * dx, y + 3 * dy));
					}
					for (var sign of [-1, 1]) {
						if (this._get(x + dx + sign * dy, y + dy + sign * dx) <= 0
							&& this._get(x + dx - sign * dy, y + dy - sign * dx) == this.side
							&& this._get(x + dx - 2 * sign * dy, y + dy - 2 * sign * dx) == oppo
							&& this._get(x + dx - 3 * sign * dy, y + dy - 3 * sign * dx) <= 0)
						{
							taken.push(this._toIndex(x + dx - 2 * sign * dy, y + dy - 2 * sign * dx));
						}
						if (this._get(x + dx + sign * dy, y + dy + sign * dx) == this.side
							&& this._get(x + dx + 2 * sign * dy, y + dy + 2 * sign * dx) <= 0
							&& this._get(x + dx - sign * dy, y + dy - sign * dx) == oppo
							&& this._get(x + dx - 2 * sign * dy, y + dy - 2 * sign * dx) <= 0)
						{
							taken.push(this._toIndex(x + dx - sign * dy, y + dy - sign * dx));
						}
					}
					var move = {
						from: p,
						to: this._toIndex(x + dx, y + dy),
						taken: taken
					};
					if (taken.length == 0 || inferiorMoveStartIndex == moves.length) moves.push(move);
					else {
						moves.push(moves[inferiorMoveStartIndex]);
						moves[inferiorMoveStartIndex++] = move;
					}
				}
			}
		}
		if (moves.length == 0 && this.pieces[this.side].length > 0) {
			moves.push(PASS_MOVE);
		}
		return moves;
	};

	Board.prototype._toIndex = function(x, y) {
		return y * this.width + x;
	};

	Board.prototype._flipPiece = function(piece, dir) {
		if (dir & FLIP_H) piece = piece + this.width - 1 - 2 * (piece % this.width);
		if (dir & FLIP_V) return piece + this.width * (this.height - 1 - 2 * (piece / this.width | 0));
		return piece;
	};

	Board.prototype._get = function(x, y) {
		if (x < 0 || x >= this.width) return -1;
		if (y < 0 || y >= this.height) return -1;
		return this.board[this._toIndex(x, y)];
	};

	Board.prototype.toCode = function() {
		var result = (this.side == P1 ? "+" : "-") + this.variant;
		for (var y = 0; y < this.height; y++) {
			var part = 0;
			for (var x = 0; x < this.width; x++) {
				part = 3 * part + this.board[y * this.width + x];
			}
			result += "." + part;
		}
		return result;
	};

	Board.fromCode = function(string) {
		if (string == null) return new Board();

		var arr = [];
		var parts = string.split(".");
		var variant = parts[0].substring(1);
		for (var i = parts.length - 1; i >= 1; i--) {
			var code = +parts[i];
			for (var x = 0; x < VARIANTS[variant].width; x++) {
				arr.push(code % 3);
				code = code / 3 | 0;
			}
		}
		return new Board(variant, arr.reverse(), string.charAt(0) == "+" ? P1 : P2);
	};

	Board.prototype.clone = function() {
		return Board.fromCode(this.toCode());
	};

	Board.prototype._freedom = function() {
		var degree = 0;
		for (var player of [P1, P2]) {
			for (var p of this.pieces[player]) {
				var x = p % this.width;
				var y = p / this.width | 0;
				for (var dir of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
					var dx = dir[0], dy = dir[1];
					if (this._get(x + dx, y + dy) == 0) {
						degree += player == P1 ? 1 : -1;
					}
				}
			}
		}
		return degree;
	};

	Board.evaluationYield = function(evalProcess) {
		var deadline = Date.now() + YIELD_INTERVAL;
		var evalResult = evalProcess.next();
		var depth = evalResult.value.depth;
		while (!evalResult.done && depth === evalResult.value.depth && Date.now() < deadline) {
			evalResult = evalProcess.next();
		}
		return evalResult;
	};

	Board.prototype.staticEvaluation = function() {
		if (this.pieces[P1].length * this.pieces[P2].length == 2) { // 2vs1
			return this.pieces[P1].length - this.pieces[P2].length;
		}
		if (this.pieces[P1].length == 2 && this.pieces[P2].length == 2) {
			return 0;
		}
		return (this.pieces[P1].length - this.pieces[P2].length) * 90
					+ VARIANTS[this.variant].heuristic(this.board)
					+ this._freedom();
	};

	Board.prototype.evaluate = function*(timeLimit, maxDepth) {
		var deadline = Date.now() + timeLimit;
		var minDepth = maxDepth <= MIN_SEARCH_DEPTH ? MIN_SEARCH_DEPTH : maxDepth >= BASE_SEARCH_DEPTH ? BASE_SEARCH_DEPTH : maxDepth;
		if (maxDepth < minDepth) maxDepth = minDepth;

		var moves = this.moves();
		var result = null, stat = { count: 0, table: 0 }, repeats = {}, pvs = {};
		repeats[this.hash] = 1;
		depthLoop: for (var depth = minDepth; depth <= maxDepth; depth++) {
			var evalProcess = this.clone()._evaluate(0, depth, stat, -Infinity, Infinity, repeats, pvs);
			var evalResult = evalProcess.next();
			while (!evalResult.done) {
				if (result != null && Date.now() > deadline) break depthLoop;
				evalResult = evalProcess.next();
				yield { ...result, ...stat };
			}
			result = evalResult.value;
			result.depth = depth;

			// zobrist hash collision
			if (moves.length > 0) {
				var m = result.pv[result.pv.length - 1], matched = false;
				for (var move of moves) {
					if (Board.isSameMove(move, m)) {
						matched = true;
						break;
					}
				}
				if (!matched) {
					// got a nonsensical move, assume it is due to zobrist hash collision
					Board.setTranspositionTableMaxSize(0);
					result = null;
					depth = minDepth - 1;
					continue depthLoop;
				}
			}

			if (Math.abs(result.score) >= MATE_BASE && MATE_SCORE - Math.abs(result.score) <= depth) break;

			var tmpHash = this.hash, tmpSide = this.side;
			for (var i = result.pv.length - 1; i >= 0; i--) {
				pvs[tmpHash] = 1;
				tmpHash = Zobrist.update(tmpHash, result.pv[i], tmpSide);
				tmpSide = _opponent(tmpSide);
			}

			yield { ...result, ...stat };
		}
		return { ...result, ...stat };
	};

	Board.prototype._evaluate = function*(ply, depth, stat, alpha, beta, repeats, pvs) {

		stat.count++;
		yield;

		if (this.pieces[P2].length == 0) {
			return {
				score: MATE_SCORE - ply
			};
		}
		if (this.pieces[P1].length == 0) {
			return {
				score: -MATE_SCORE + ply
			};
		}

		var code = this.hash;

		if (repeats[code] >= MAX_REPETITION) {
			return {
				score: 0
			};
		}

		if (getTranspositionTable(code, depth) != null) {
			var localPv = [];
			var hasRepeat = _resolveTableMoves(code, localPv, repeats);
			stat.table++;
			return {
				score: hasRepeat ? _augmentLoopScore(transpositionTable[code].score) : _augmentMateScore(transpositionTable[code].score, ply),
				pv: localPv.reverse()
			};
		}

		if (depth <= 0 || alpha + ply >= MATE_SCORE || beta - ply <= -MATE_SCORE) {
			return {
				score: this.staticEvaluation()
			};
		}

		var moves = this.moves();
		if (moves.length > 1) {
			for (var move of moves) {
				move.score = getTranspositionTable(Zobrist.update(code, move, this.side), 0);
			}
			moves.sort(function(m1, m2) {
				if (m1.score == null && m2.score == null) return 0;
				if (m1.score == null) return 1;
				if (m2.score == null) return -1;
				if (m1.score > m2.score) return this.side == P1 ? -1 : 1;
				if (m1.score < m2.score) return this.side == P1 ? 1 : -1;
				return 0;
			});
		}

		var bestScore = null;
		var bestMove = null;
		var bestCode = null;
		var pv = [];
		for (var i = 0; i < moves.length; i++) {
			var move = moves[i];
			this.play(move);
			var moveCode = this.hash;
			repeats[moveCode] = (repeats[moveCode] || 0) + 1;

			var adjustedDepth = depth - 1;
			if (depth < 3 && move.taken && move.taken.length > 0) adjustedDepth++; // quiescence search
			if (ply < depth && pvs[moveCode]) adjustedDepth++; // pv extension

			var evalProcess = this._evaluate(ply + 1, adjustedDepth, stat, alpha, beta, repeats, pvs);
			var evalResult = evalProcess.next();
			while (!evalResult.done) {
				yield;
				evalResult = evalProcess.next();
			}
			if (--repeats[moveCode] == 0) delete repeats[moveCode];
			this.unplay(move);

			var eval = evalResult.value;
			var score = eval.score;
			if (bestScore == null || this.side == P1 && score > bestScore || this.side == P2 && score < bestScore) {
				bestScore = score;
				bestMove = null;
				bestCode = null;
				pv = null;
			}

			if (this.side == P1 && score > alpha) {
				alpha = score;
				bestMove = move;
				bestCode = moveCode;
				pv = eval.pv || [];
			} else if (this.side == P2 && score < beta) {
				beta = score;
				bestMove = move;
				bestCode = moveCode;
				pv = eval.pv || [];
			}

			if (beta <= alpha) {
				break;
			}
		}

		if (bestMove) {
			if (i >= moves.length - 1) putTranspositionTable(code, depth, _augmentMateScore(bestScore, -ply), bestMove, bestCode);
			pv.push(bestMove);
			return {
				score: bestScore,
				pv: pv
			};
		}

		return { score: bestScore };
	};

	// Transposition Table
	var transpositionTable = {};
	var transpositionTableSize = 0;

	function _resetTranspositionTable() {
		transpositionTable = {};
		transpositionTableSize = 0;
	}

	function cleanUpTranspositionTable() {
		const COLD_TABLE_SIZE = Math.floor(MAX_TABLE_SIZE * COLD_TABLE_PERCENTAGE) || 1;
		var entries = Object.entries(transpositionTable);
		entries.sort(function(a, b) {
			return (a[1].depth - a[1].stale * 2) - (b[1].depth - b[1].stale * 2);
		});
		for (var i = 0; i < entries.length; i++) {
			var entry = entries[i];
			if (i < COLD_TABLE_SIZE) {
				delete transpositionTable[entry[0]];
			} else {
				transpositionTable[entry[0]].stale++;
			}
		}
		transpositionTableSize -= COLD_TABLE_SIZE;
	}

	function getTranspositionTable(code, depth) {
		return transpositionTable[code] && transpositionTable[code].depth >= depth ? transpositionTable[code].score : null;
	}

	function putTranspositionTable(code, depth, score, move, moveCode) {
		if (MAX_TABLE_SIZE == 0 || getTranspositionTable(code, depth) != null) return;
		if (transpositionTable[code] == null) {
			if (transpositionTableSize >= MAX_TABLE_SIZE) cleanUpTranspositionTable();
			transpositionTableSize++;
		}
		transpositionTable[code] = {
			score: score,
			depth: depth,
			move: move,
			moveCode: moveCode,
			stale: 0
		};
	}

	function _resolveTableMoves(code, pv, repeats) {
		pv.push(transpositionTable[code].move);
		var depth = transpositionTable[code].depth;
		var code = transpositionTable[code].moveCode;
		var localRepeats = {};
		var hasRepeat = false;

		while (transpositionTable[code]) {
			depth--;
			if (!hasRepeat) {
				if (repeats[code] || localRepeats[code]) hasRepeat = true;
				else localRepeats[code] = 1;
			} else if (depth <= 0) {
				break;
			}
			pv.push(transpositionTable[code].move);
			code = transpositionTable[code].moveCode;
		}
		return hasRepeat;
	}

	Board.CONST = {
		MATE_BASE: MATE_BASE,
		MATE_SCORE: MATE_SCORE,
		FLIP_NULL: FLIP_NULL,
		FLIP_H: FLIP_H,
		FLIP_V: FLIP_V,
		P1: P1,
		P2: P2,
		VARIANTS: (function() {
			var results = {};
			for (var key in VARIANTS) {
				results[key] = VARIANTS[key].name;
			}
			return results;
		}())
	};

	Board.opponentOf = _opponent;

	Board.resetTranspositionTable = _resetTranspositionTable;

	Board.setTranspositionTableMaxSize = function(size) {
		MAX_TABLE_SIZE = Math.max(0, +size) || 0;
		_resetTranspositionTable();
	};

	return Board;

})();
