const P1 = 1, P2 = 2;
const WIDTH = 4, HEIGHT = 4;
const FLIP_NULL = 0, FLIP_H = 1, FLIP_V = 2;
const MATE_BASE = 99000, MATE_SCORE = 99999;

function _opponent(side) {
	return P1 + P2 - side;
}

function _flip(piece, dir) {
	if (dir & FLIP_H) piece = piece + WIDTH - 1 - 2 * (piece % WIDTH);
	if (dir & FLIP_V) return piece + WIDTH * (HEIGHT - 1 - 2 * (piece / WIDTH | 0));
	return piece;
}

var Board = (function() {

	const MAX_REPETITION = 2;

	const MAX_TABLE_SIZE = 50000;
	const COLD_TABLE_SIZE = Math.floor(MAX_TABLE_SIZE * 0.7);
	const MAX_TABLE_MATE_DEPTH = 6;
	const MIN_SEARCH_DEPTH = 1;
	const BASE_SEARCH_DEPTH = 4;

	const YIELD_INTERVAL = 150;

	const POS_HEURISTIC = {
		 5: [0, 20, -10],
		 6: [0, 20, -10],
		 9: [0, 10, -20],
		10: [0, 10, -20]
	};

	function _toIndex(x, y) {
		return y * WIDTH + x;
	}

	function _augmentMateScore(score, depth) {
		return score >= MATE_BASE ? score - depth : score <= -MATE_BASE ? score + depth : score;
	}

	// Board
	function Board(board, side) {
		this.board = board ||
					 [P2,P2,P2,P2,
					  P2, 0, 0,P2,
					  P1, 0, 0,P1,
					  P1,P1,P1,P1];
		this.pieces = [];
		this.pieces[P1] = [];
		this.pieces[P2] = [];
		for (var i = 0; i <= WIDTH * HEIGHT; i++) {
			for (var player of [P1, P2]) {
				if (this.board[i] == player) {
					this.pieces[player].push(i);
					break;
				}
			}
		}
		this.side = side || P1;

		this.flip = null;
		this.code = null;
	}

	Board.prototype._checkFlip = function() {
		if (this.flip != null) return;
		this.flip = [];
		this.flip[FLIP_NULL] = true;
		dirLoop: for (var dir of [FLIP_H, FLIP_V]) {
			this.flip[dir] = true;
			for (var player of [P1, P2]) {
				for (var piece of this.pieces[player]) {
					if (this.board[_flip(piece, dir)] != player) {
						this.flip[dir] = false;
						continue dirLoop;
					}
				}
			}
		}
	};

	Board.prototype.play = function(move) {
		if (move.from == null) {
			this.side = _opponent(this.side);
			this.code = this.code == null ? null : -this.code;
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
		this.code = null;
	};

	Board.prototype.unplay = function(move) {
		if (move.from == null) {
			this.side = _opponent(this.side);
			this.code = this.code == null ? null : -this.code;
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
		this.code = null;
	};

	Board.prototype.moves = function() {
		var moves = [], inferiorMoveStartIndex = 0, oppo = _opponent(this.side);
		for (var p of this.pieces[this.side]) {
			var x = p % WIDTH;
			var y = p / WIDTH | 0;
			this._checkFlip();
			if (this.flip[FLIP_H] && x >= WIDTH / 2) continue;
			if (this.flip[FLIP_V] && y >= WIDTH / 2) continue;

			for (var dir of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				var dx = dir[0], dy = dir[1];
				if (this._get(x + dx, y + dy) == 0) {
					var taken = [];
					if (this._get(x + 2 * dx, y + 2 * dy) == this.side && this._get(x + 3 * dx, y + 3 * dy) == oppo && this._get(x + 4 * dx, y + 4 * dy) <= 0) {
						taken.push(_toIndex(x + 3 * dx, y + 3 * dy));
					}
					for (var sign of [-1, 1]) {
						if (this._get(x + dx + sign * dy, y + dy + sign * dx) <= 0
							&& this._get(x + dx - sign * dy, y + dy - sign * dx) == this.side
							&& this._get(x + dx - 2 * sign * dy, y + dy - 2 * sign * dx) == oppo
							&& this._get(x + dx - 3 * sign * dy, y + dy - 3 * sign * dx) <= 0)
						{
							taken.push(_toIndex(x + dx - 2 * sign * dy, y + dy - 2 * sign * dx));
						}
						if (this._get(x + dx + sign * dy, y + dy + sign * dx) == this.side
							&& this._get(x + dx + 2 * sign * dy, y + dy + 2 * sign * dx) <= 0
							&& this._get(x + dx - sign * dy, y + dy - sign * dx) == oppo
							&& this._get(x + dx - 2 * sign * dy, y + dy - 2 * sign * dx) <= 0)
						{
							taken.push(_toIndex(x + dx - sign * dy, y + dy - sign * dx));
						}
					}
					var move = {
						from: p,
						to: _toIndex(x + dx, y + dy),
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
		if (moves.length == 0 && this.pieces[this.side].length > 0) { // PASS move
			moves.push({
				from: null
			});
		}
		return moves;
	};

	Board.prototype._get = function(x, y) {
		if (x < 0 || x >= WIDTH) return -1;
		if (y < 0 || y >= HEIGHT) return -1;
		return this.board[_toIndex(x, y)];
	};

	Board.prototype._encode = function() {
		if (this.code != null) return this.code;
		var result = 0;
		for (var p of this.board) result = 3 * result + p;
		return this.code = this.side == P1 ? result : -result;
	};

	Board.fromCode = function(code) {
		if (code == null) return new Board();
		var side = code > 0 ? P1 : P2, arr = [];
		code = Math.abs(code);
		for (var i = 0; i < WIDTH * HEIGHT; i++) {
			arr[WIDTH * HEIGHT - i - 1] = code % 3;
			code = code / 3 | 0;
		}
		return new Board(arr, side);
	};

	Board.prototype.clone = function() {
		return Board.fromCode(this._encode());
	};

	Board.prototype._degreeOfFreedom = function() {
		var degree = 0;
		for (var player of [P1, P2]) {
			for (var p of this.pieces[player]) {
				var x = p % WIDTH;
				var y = p / WIDTH | 0;
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
		var evalResult, intermediateResult;
		do {
			evalResult = evalProcess.next();
			if (evalResult.value != null || intermediateResult == null) intermediateResult = evalResult;
		} while (!evalResult.done && Date.now() < deadline);
		return intermediateResult;
	};

	Board.prototype._demoteLoopingPV = function(result) {
		if (result.pv == null || result.pv.length == 0) return;
		var i = result.pv.length - 1, repeats = {};
		repeats[this._encode()] = 1;
		while (i >= 0) {
			this.play(result.pv[i--]);
			if (repeats[this._encode()]) {
				if (transpositionTable[this._encode()]) {
					transpositionTable[this._encode()].score = 0;
				}
				break;
			} else {
				repeats[this._encode()] = 1;
			}
		}
		while (++i < result.pv.length) {
			this.unplay(result.pv[i]);
		}
	};

	Board.prototype.evaluate = function*(timeLimit, maxDepth) {
		var deadline = Date.now() + timeLimit;
		var minDepth = maxDepth <= MIN_SEARCH_DEPTH ? MIN_SEARCH_DEPTH : maxDepth >= BASE_SEARCH_DEPTH ? BASE_SEARCH_DEPTH : maxDepth;
		if (maxDepth < minDepth) maxDepth = minDepth;
		var result = null, repeats = {};
		repeats[this._encode()] = 1;
		depthLoop: for (var depth = minDepth; depth <= maxDepth; depth++) {
			var evalProcess = this.clone()._evaluate(0, depth, -Infinity, Infinity, repeats, depth >= MAX_TABLE_MATE_DEPTH);
			var evalResult = evalProcess.next();
			while (!evalResult.done) {
				if (result != null && Date.now() > deadline) break depthLoop;
				evalResult = evalProcess.next();
				yield;
			}
			result = evalResult.value;
			result.depth = depth;
			_resolveTablePV(result);
			this._demoteLoopingPV(result);
			if (Math.abs(result.score) >= MATE_BASE && MATE_SCORE - Math.abs(result.score) <= depth) break;
			yield result;
		}
		return result;
	};

	Board.prototype._evaluate = function*(depth, maxDepth, alpha, beta, repeats, useTable) {

		yield;

		if (this.pieces[P2].length == 0) {
			return {
				score: MATE_SCORE - depth,
				count: 1,
				table: 0
			};
		}
		if (this.pieces[P1].length == 0) {
			return {
				score: -MATE_SCORE + depth,
				count: 1,
				table: 0
			};
		}

		if (depth > 0 && repeats[this._encode()] >= MAX_REPETITION) {
			return {
				score: 0,
				count: 1,
				table: 0
			};
		}

		if (useTable) {
			var code = this._encode();
			if (getTranspositionTable(code, maxDepth - depth) != null) {
				return {
					score: _augmentMateScore(transpositionTable[code].score, depth),
					count: 1,
					table: 1,
					pv: [{code: code}]
				};
			}
		}

		if (depth >= maxDepth) {
			if (this.pieces[P1].length * this.pieces[P2].length == 2) { // 2vs1
				return {
					score: (this.pieces[P1].length - this.pieces[P2].length) * 20,
					count: 1,
					table: 0
				};
			}
			if (this.pieces[P1].length == 2 && this.pieces[P2].length == 2) {
				return {
					score: 0,
					count: 1,
					table: 0
				};
			}
			return {
				score: (this.pieces[P1].length - this.pieces[P2].length) * 90
						+ POS_HEURISTIC[5][this.board[5]]
						+ POS_HEURISTIC[6][this.board[6]]
						+ POS_HEURISTIC[9][this.board[9]]
						+ POS_HEURISTIC[10][this.board[10]]
						+ this._degreeOfFreedom() * 10,
				count: 1,
				table: 0
			};
		}

		var cutoff = null;
		var score = null;
		var count = 1;
		var table = 0;
		var best = null;
		var bestCode = null;
		var pv = [];
		for (var move of this.moves()) {
			this.play(move);
			var moveCode = this._encode();
			repeats[moveCode] = (repeats[moveCode] || 0) + 1;
			var evalProcess = this._evaluate(depth + 1, maxDepth + (move.taken && move.taken.length > 0 && depth + 1 >= maxDepth ? 1 : 0), alpha, beta, repeats, useTable);
			var evalResult = evalProcess.next();
			while (!evalResult.done) {
				yield;
				evalResult = evalProcess.next();
			}
			if (--repeats[moveCode] == 0) delete repeats[moveCode];
			this.unplay(move);

			var eval = evalResult.value;
			if (score == null || this.side == P1 && eval.score > score || this.side == P2 && eval.score < score) {
				score = eval.score;
				best = move;
				bestCode = moveCode;
				pv = eval.pv || [];
				cutoff = eval.cutoff;
			}
			count += eval.count;
			table += eval.table;

			if (this.side == P1) alpha = Math.max(alpha, eval.score);
			else if (this.side == P2) beta = Math.min(beta, eval.score);
			if (beta <= alpha) {
				cutoff = true;
				break;
			}
		}

		if (useTable && !cutoff) {
			putTranspositionTable(code, maxDepth - depth, _augmentMateScore(score, -depth), best, bestCode);
		}

		pv.push(best);
		return {
			score: score,
			count: count,
			table: table,
			pv: pv,
			cutoff: cutoff
		};
	};

	// Transposition Table
	var transpositionTable = {};
	var transpositionTableSize = 0;

	function clearTranspositionTable() {
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
		if (Math.abs(score) >= MATE_BASE && MATE_SCORE - Math.abs(score) >= MAX_TABLE_MATE_DEPTH || getTranspositionTable(code, depth) != null) return;
		if (transpositionTable[code] == null) {
			if (transpositionTableSize >= MAX_TABLE_SIZE) clearTranspositionTable();
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

	function _resolveTablePV(result) {
		if (result.pv == null || result.pv.length == 0 || !result.pv[0].code) return;

		var code = result.pv[0].code;
		var depth = (transpositionTable[code] || {}).depth;

		var moves = [];
		while (transpositionTable[code] && depth-- > 0) {
			moves.push(transpositionTable[code].move);
			code = transpositionTable[code].moveCode;
		}

		result.pv = moves.reverse().concat(result.pv.slice(1));
	}

	return Board;

})();
