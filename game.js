const Game = (function() {

	const MOVES_TO_DRAW = 50;

	const MIN_COMPUTER_PLAY_DELAY = 100;
	const ENABLE_WORKER = true;

	const HUMAN_PLAYER_LABEL = "HUMAN";
	const COMPUTER_PLAYER_LABEL = "COMPUTER";

	const SCORE_ADVANTAGE_THRESHOLD = 70;
	const SCORE_WINNING_THRESHOLD = 170;

	function _prettyCount(count) {
		return count < 100000 ? count : count < 1000000 ? Math.floor(count / 100) / 10 + "K" : Math.floor(count / 100000) / 10 + "M";
	}

	function copyToClipboard(text) {
		var e = document.createElement("textarea");
		e.value = text;
		e.style.position = "absolute";
		e.style.left = "-9999px";
		document.body.appendChild(e);
		var selected = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0) : null;
		e.select();
		e.setSelectionRange(0, text.length);
		document.execCommand("copy");
		document.body.removeChild(e);
		if (selected) {
			document.getSelection().removeAllRanges();
			document.getSelection().addRange(selected);
		}
	}

	// Game
	function Game($div, boardCode, flip) {
		this.view = {
			$div: $div,
			$cells: []
		};

		this.control = [];
		this.initWorker();
		this.initTranspositionTableMaxSize();
		this.firstDraw();
		if (boardCode == null) {
			this.newGame(new Board(this.view.$gameVariantSelect.value), flip);
		} else {
			this.newGame(Board.fromCode(boardCode), flip);
			this.view.$gameVariantSelect.value = this.board.variant;
		}
		this.view.$table.dataset.width = this.board.width;
		this.setPlayerControl(HUMAN_PLAYER_LABEL, COMPUTER_PLAYER_LABEL);
		this.redraw();
	}

	Game.prototype.newGame = function(board, flip) {
		this.historyMoves = [];
		this.historyFlips = [];
		this.historyCapture = [];
		this.currentFlip = flip || Board.CONST.FLIP_NULL;
		this.historyIndex = 0;

		this.chosen = null;
		this.board = board;
		this.resetTranspositionTable();
		this.resizeBoard();
		this.startEvaluation();
	};

	Game.prototype.resetTranspositionTable = function() {
		if (this.worker) {
			this.worker.postMessage({action: "RESET_TABLE"});
		} else {
			Board.resetTranspositionTable();
		}
	};

	Game.prototype.initTranspositionTableMaxSize = function() {
		var match = window.location.hash.match(/#tableSize=([^#&]+)/);
		if (match) {
			this.setTranspositionTableMaxSize(+match[1]);
		}
	};

	Game.prototype.setTranspositionTableMaxSize = function(size) {
		console.log("Set transposition table max size to " + size);
		if (this.worker) {
			this.worker.postMessage({action: "SET_TABLE_MAX_SIZE", value: size});
		} else {
			Board.setTranspositionTableMaxSize(size);
		}
	};

	Game.prototype.isFinished = function() {
		return this.board.pieces[Board.CONST.P1].length == 0 || this.board.pieces[Board.CONST.P2].length == 0
			|| (this.historyCapture[this.historyIndex - 1] || 0) >= MOVES_TO_DRAW * 2;
	};

	Game.prototype.unscheduleComputerPlay = function() {
		if (this._computerPlayTimeoutId == null) return;
		clearTimeout(this._computerPlayTimeoutId);
		this._computerPlayTimeoutId = null;
	};

	Game.prototype.scheduleComputerPlay = function() {
		if (this.evaluating || this.control[this.board.side] == HUMAN_PLAYER_LABEL) return;
		this.unscheduleComputerPlay();
		var delay = MIN_COMPUTER_PLAY_DELAY - Date.now() + (this._lastComputerPlay || 0);
		if (delay <= 0) this.computerPlay();
		else {
			var that = this;
			this._computerPlayTimeoutId = setTimeout(function() { that.computerPlay(); }, delay);
		}
	};

	Game.prototype.computerPlay = function() {
		if (this.evaluating || this.control[this.board.side] == HUMAN_PLAYER_LABEL) return;
		this._lastComputerPlay = Date.now();
		this._computerPlayTimeoutId = null;
		var move = this.eval.pv == null ? null : this.eval.pv[this.eval.pv.length - 1];
		if (move != null && !this.isFinished()) {
			this.play(move.from, move.to);
		}
	};

	// Game moves
	Game.prototype.play = function(from, to) {
		var moves = this.board.moves();
		var matchedMove = null, matchedFlip = null;
		if (from == to) {
			if (moves.length == 1 && Board.isPassMove(moves[0])) {
				matchedMove = moves[0];
			}
		} else {
			nodeLoop: {
				this.board._checkFlip();
				for (var dir of [Board.CONST.FLIP_NULL, Board.CONST.FLIP_H, Board.CONST.FLIP_V]) {
					if (!this.board.flip[dir]) continue;
					var flippedFrom = this.board._flipPiece(from, dir);
					var flippedTo = this.board._flipPiece(to, dir);
					for (var move of moves) {
						if (move.from == flippedFrom && move.to == flippedTo) {
							matchedMove = move;
							matchedFlip = dir;
							break nodeLoop;
						}
					}
				}
				if (this.board.flip[Board.CONST.FLIP_H] && this.board.flip[Board.CONST.FLIP_V]) {
					var flippedFrom = this.board._flipPiece(from, Board.CONST.FLIP_H | Board.CONST.FLIP_V);
					var flippedTo = this.board._flipPiece(to, Board.CONST.FLIP_H | Board.CONST.FLIP_V);
					for (var move of moves) {
						if (move.from == flippedFrom && move.to == flippedTo) {
							matchedMove = child;
							matchedFlip = Board.CONST.FLIP_H | Board.CONST.FLIP_V;
							break nodeLoop;
						}
					}
				}
			}
		}
		if (matchedMove) {
			this.board.play(matchedMove);

			this.historyMoves.length = this.historyIndex;
			this.historyFlips.length = this.historyIndex;
			this.historyCapture.length = this.historyIndex++;

			this.historyMoves.push(matchedMove);
			this.historyFlips.push(matchedFlip);
			this.historyCapture.push(matchedMove.taken && matchedMove.taken.length > 0 ? 0 : (this.historyCapture[this.historyIndex - 2] || 0) + 1);
			this.currentFlip ^= matchedFlip;

			this.startEvaluation();
			this.chosen = null;
			this.redraw();
		}
	};

	Game.prototype.undo = function(count) {
		if (this.historyIndex <= 0 || count == 0) return;
		while (count--) {
			this.board.unplay(this.historyMoves[--this.historyIndex]);
			this.currentFlip ^= this.historyFlips[this.historyIndex];
			if (this.historyIndex <= 0) break;
		}
		this.setPlayerControl(HUMAN_PLAYER_LABEL, HUMAN_PLAYER_LABEL);
		this.startEvaluation();
		this.chosen = null;
		this.redraw();
	};

	Game.prototype.redo = function(count) {
		if (this.historyIndex >= this.historyMoves.length || count == 0) return;
		while (count--) {
			this.board.play(this.historyMoves[this.historyIndex]);
			this.currentFlip ^= this.historyFlips[this.historyIndex++];
			if (this.historyIndex >= this.historyMoves.length) break;
		}
		this.setPlayerControl(HUMAN_PLAYER_LABEL, HUMAN_PLAYER_LABEL);
		this.startEvaluation();
		this.chosen = null;
		this.redraw();
	};

	Game.prototype.takeBack = function() {
		var control1 = this.control[Board.CONST.P1], control2 = this.control[Board.CONST.P2];
		if (control1 == HUMAN_PLAYER_LABEL && control2 == HUMAN_PLAYER_LABEL) {
			this.undo(1);
		} else if (control1 != control2) {
			var steps = control1 == HUMAN_PLAYER_LABEL && this.board.side == Board.CONST.P1 || control2 == HUMAN_PLAYER_LABEL && this.board.side == Board.CONST.P2 ? 2 : 1;
			if (this.historyIndex >= steps) {
				this.undo(steps);
				this.setPlayerControl(control1, control2);
			}
		}
	};

	Game.prototype.setPlayerControl = function(control1, control2) {
		this.control[Board.CONST.P1] = control1;
		this.control[Board.CONST.P2] = control2;
		this.view.$playerControl[Board.CONST.P1].classList[control1 == HUMAN_PLAYER_LABEL ? "add" : "remove"]("human");
		this.view.$playerControl[Board.CONST.P2].classList[control2 == HUMAN_PLAYER_LABEL ? "add" : "remove"]("human");
		this.view.$takeBackButton.disabled = control1 == COMPUTER_PLAYER_LABEL && control2 == COMPUTER_PLAYER_LABEL;
	};

	Game.prototype.choose = function(id) {
		if (this.chosen != null) this.view.$cells[this.board._flipPiece(this.chosen, this.currentFlip)].classList.remove("chosen");
		this.chosen = id;
		if (this.chosen != null) this.view.$cells[this.board._flipPiece(this.chosen, this.currentFlip)].classList.add("chosen");
	};

	// Game UI
	Game.prototype.resizeBoard = function() {
		var $table = this.view.$table;
		while ($table.firstChild) {
			$table.removeChild($table.firstChild);
		}
		this.view.$cells = [];
		for (var j = 0; j < this.board.height; j++) {
			var $row = document.createElement("tr");
			var $cell = document.createElement("td");
			$cell.innerText = this.board.height - j;
			$row.appendChild($cell);
			for (var i = 0; i < this.board.width; i++) {
				var $cell = document.createElement("td");
				$cell.dataset.id = j * this.board.width + i;
				$row.appendChild($cell);
				this.view.$cells.push($cell);
			}
			$table.appendChild($row);
		}
		var $row = document.createElement("tr");
		$row.appendChild(document.createElement("td"));
		for (var i = 0; i < this.board.width; i++) {
			var $cell = document.createElement("td");
			$cell.innerText = String.fromCharCode("a".charCodeAt(0) + i);
			$row.appendChild($cell);
		}
		$table.appendChild($row);
	};

	Game.prototype.firstDraw = function() {
		var that = this;

		function confirmNewGame(event) {
			if (event.ctrlKey || event.shiftKey || confirm("New game?")) {
				that.newGame(new Board(that.view.$gameVariantSelect.value));
				that.redraw();
			}
		}

		window.addEventListener("keydown", function(e) {
			if (e.target.matches("input, textarea")) return;
			switch (e.key) {
				case "Left":
				case "ArrowLeft":
					that.undo(e.shiftKey ? Infinity : 1);
					break;
				case "Right":
				case "ArrowRight":
					that.redo(e.shiftKey ? Infinity : 1);
					break;
				case "Backspace":
					that.takeBack();
					break;
				case " ":
					that.interruptEvaluation();
					break;
				case "n":
				case "N":
					confirmNewGame(e);
					break;
			}
		});

		this.view.$table = this.view.$div.querySelector("table");
		this.view.$table.addEventListener("click", function(e) {
			if (!e.target.matches("td")) return;
			if (that.isFinished() || that.control[that.board.side] != HUMAN_PLAYER_LABEL) return;
			var id = +e.target.dataset.id;
			id = that.board._flipPiece(id, that.currentFlip);
			if (that.chosen == null) {
				if (that.board.board[id] == that.board.side) that.choose(id);
			} else {
				if (that.chosen == id) that.play(id, id); // attempt a pass
				else if (that.board.board[id] == that.board.side) that.choose(id);
				else if (that.board.board[id] == Board.opponentOf(that.board.side)) that.choose(null);
				else that.play(that.chosen, id);
			}
		});
		document.addEventListener("click", function(e) {
			if (e.target.matches("td")) return;
			that.choose(null);
		});

		var $computerSettings = this.view.$div.querySelector("div.computer-settings");
		$computerSettings.querySelector(".title").addEventListener("click", function() {
			$computerSettings.classList.toggle("collapse");
			_saveSettings();
		});
		this.view.$status = this.view.$div.querySelector("span.status");
		this.view.$interrupt = this.view.$div.querySelector("span.interrupt");
		this.view.$interrupt.addEventListener("click", function(e) {
			that.interruptEvaluation();
			e.stopPropagation();
		});
		if (!this.worker) this.view.$status.classList.add("missing-worker");
		this.view.$evaluation = {};
		this.view.$evaluation.wrapper = this.view.$div.querySelector("div.evaluation");
		this.view.$evaluation.wrapper.addEventListener("click", function() {
			$computerSettings.classList.toggle("hide-evaluation");
			_saveSettings();
		});
		for (var name of ["score", "count", "table", "depth", "time"]) {
			this.view.$evaluation[name] = this.view.$evaluation.wrapper.querySelector("." + name);
		}
		this.view.$evaluation.pv = this.view.$div.querySelector("span.principal-variation");
		this.view.$evaluation.pv.addEventListener("click", function() {
			window.open("#analysis=" + that.currentFlip + that.board.toCode() + "&#pv=" + that._encodePv());
		});
		this.view.$timeSetting = this.view.$div.querySelector("#time-setting");
		this.view.$timeSetting.addEventListener("change", function() {
			_saveSettings();
			that.startEvaluation();
			that.redraw();
		});
		this.view.$depthSetting = this.view.$div.querySelector("#depth-setting");
		this.view.$depthSetting.addEventListener("change", function() {
			_saveSettings();
			that.startEvaluation();
			that.redraw();
		});

		this.view.$playerControl = {};
		this.view.$playerControl.wrapper = this.view.$div.querySelector("div.player-control-wrapper");
		this.view.$playerControl.wrapper.addEventListener("click", function(e) {
			if (!e.target.matches(".player")) return;
			var $playerControl = e.target.closest(".player-control");
			that.control[$playerControl.dataset.player] = e.target.dataset.value;
			that.setPlayerControl(that.control[Board.CONST.P1], that.control[Board.CONST.P2]);
			that.scheduleComputerPlay();
		});
		this.view.$playerControl[Board.CONST.P1] = this.view.$playerControl.wrapper.querySelectorAll("div.player-control")[0];
		this.view.$playerControl[Board.CONST.P1].dataset.player = Board.CONST.P1;
		this.view.$playerControl[Board.CONST.P2] = this.view.$playerControl.wrapper.querySelectorAll("div.player-control")[1];
		this.view.$playerControl[Board.CONST.P2].dataset.player = Board.CONST.P2;

		this.view.$playerControl.wrapper.querySelectorAll("div.handshake").forEach(function(e) {
			e.setAttribute("title", "Draw (" + MOVES_TO_DRAW + "-move rule)");
		});
		this.view.$playerControl.wrapper.querySelectorAll("div.player.human").forEach(function(e) {
			e.dataset.value = HUMAN_PLAYER_LABEL;
		});

		this.view.$history = this.view.$div.querySelector("div.history");
		this.view.$history.addEventListener("click", function(e) {
			var $div = e.target.closest("div.event");
			if ($div == null || $div.parentElement != this) return;
			var diff = $div.dataset.index - that.historyIndex;
			if (diff > 0) that.redo(diff);
			else if (diff < 0) that.undo(-diff);
		});
		var $historyStart = document.createElement("div");
		$historyStart.innerText = "== Start ==";
		$historyStart.classList.add("active", "event");
		$historyStart.addEventListener("click", function() { that.undo(Infinity); });
		this.view.$historyResult = document.createElement("div");
		this.view.$historyResult.classList.add("result");
		this.view.$history.appendChild($historyStart);
		this.view.$history.appendChild(this.view.$historyResult);

		this.view.$gameVariantSelect = this.view.$div.querySelector("select.game-variant");
		for (var key in Board.CONST.VARIANTS) {
			var $option = document.createElement("option");
			$option.value = key;
			$option.innerText = Board.CONST.VARIANTS[key];
			this.view.$gameVariantSelect.appendChild($option);
		}
		this.view.$gameVariantSelect.addEventListener("change", function(e) {
			_saveSettings();
			that.newGame(new Board(this.value));
			that.view.$table.dataset.width = that.board.width;
			that.redraw();
		});

		this.view.$div.querySelector("button.button-new-game").addEventListener("click", function(e) { confirmNewGame(e); });
		this.view.$div.querySelector("button.button-undo-all").addEventListener("click", function() { that.undo(Infinity); });
		this.view.$div.querySelector("button.button-undo").addEventListener("click", function() { that.undo(1); });
		this.view.$div.querySelector("button.button-redo").addEventListener("click", function() { that.redo(1); });
		this.view.$div.querySelector("button.button-redo-all").addEventListener("click", function() { that.redo(Infinity); });
		this.view.$takeBackButton = this.view.$div.querySelector("button.button-take-back");
		this.view.$takeBackButton.addEventListener("click", function() { that.takeBack(); });
		this.view.$div.querySelector("button.button-new-analysis").addEventListener("click", function() {
			window.open("#analysis=" + that.currentFlip + that.board.toCode());
		});
		this.view.$div.querySelector("button.button-copy").addEventListener("click", function() {
			var text = "";
			that.view.$history.querySelectorAll(".history .event:not(:first-child), .history .result.finish").forEach(function(e) {
				text += e.innerText + "\n";
			});
			copyToClipboard(text);
		});

		function _saveSettings() {
			try {
				localStorage.setItem("gameSettings", JSON.stringify({
					computerSettingsCollapse: $computerSettings.classList.contains("collapse"),
					evaluationHide: $computerSettings.classList.contains("hide-evaluation"),
					timeSettingValue: that.view.$timeSetting.value,
					depthSettingValue: that.view.$depthSetting.value,
					gameVariantValue: that.view.$gameVariantSelect.value
				}));
			} catch (e) {
			}
		}
		(function _loadSettings() {
			try {
				var settings = JSON.parse(localStorage.getItem("gameSettings"));
				if (settings == null) return;
				if (settings.computerSettingsCollapse) $computerSettings.classList.add("collapse");
				if (settings.evaluationHide) $computerSettings.classList.add("hide-evaluation");
				that.view.$timeSetting.value = settings.timeSettingValue;
				that.view.$depthSetting.value = settings.depthSettingValue;
				if ("gameVariantValue" in settings) that.view.$gameVariantSelect.value = settings.gameVariantValue;
			} catch (e) {
			}
		})();
	};

	Game.prototype._nameIndex = function(index) {
		var x = index % this.board.width;
		var y = index / this.board.width | 0;
		return String.fromCharCode("a".charCodeAt(0) + x) + (this.board.height - y);
	};

	Game.prototype._nameMove = function(move) {
		return (Board.isPassMove(move)
				? "PASS"
				: this._nameIndex(this.board._flipPiece(move.from, this.currentFlip)) + this._nameIndex(this.board._flipPiece(move.to, this.currentFlip)) + (move.taken.length > 0 ? "+" : ""));
	};

	Game.prototype._principalVariationString = function() {
		if (this.eval == null || this.eval.pv == null) return "";
		var result = "";
		for (var move of this.eval.pv) {
			result = this._nameMove(move) + " " + result;
		}
		return result.trim();
	};

	Game.prototype._encodePv = function() {
		var board = this.board.clone();
		var code = [];
		for (var p = this.eval.pv.length - 1; p >= 0; p--) {
			var moves = board.moves().sort((m, n) => { return m.from - n.from || m.to - n.to; });
			for (var i = 0; i < moves.length; i++) {
				if (Board.isSameMove(this.eval.pv[p], moves[i])) {
					board.play(moves[i]);
					code.push(i);
					break;
				}
			}
		}
		return code.join(",");
	};

	Game.prototype._decodePvAndPlay = function(pv) {
		if (pv == null) return;
		for (var i of pv.split(",")) {
			var move = this.board.moves().sort((m, n) => { return m.from - n.from || m.to - n.to; })[i];
			if (move == null) break;
			this.play(move.from, move.to);
		}
		this.undo(Infinity);
	};

	Game.prototype.redrawEvaluation = function() {
		this.view.$status.classList[this.evaluating ? "add" : "remove"]("busy");
		this.view.$interrupt.classList[this.evaluating ? "add" : "remove"]("busy");
		if (this.eval != null) {
			var mateIn = (Board.CONST.MATE_SCORE - Math.abs(this.eval.score) + 1) >> 1;
			this.view.$evaluation.score.innerText = (
				(Math.abs(this.eval.score) >= Board.CONST.MATE_BASE
					? (this.eval.score > 0 ? "M" : "-M") + mateIn
					: (this.eval.score / 100).toFixed(1).replace(/^-(0(?:\.0+)?)$/, "$1"))
			);
			this.view.$evaluation.score.title = (
				Math.abs(this.eval.score) < SCORE_ADVANTAGE_THRESHOLD
					? "Drawish"
					: (this.eval.score > 0 ? "White " : "Black ") + (
						Math.abs(this.eval.score) == Board.CONST.MATE_SCORE
							? "wins"
							: (Math.abs(this.eval.score) < SCORE_WINNING_THRESHOLD
								? "has an advantage"
								: ("is winning" + (
									Math.abs(this.eval.score) >= Board.CONST.MATE_BASE
										? " in " + mateIn + " move" + (mateIn == 1 ? "" : "s")
										: ""
								)
							)
						)
					)
			);
			for (var name of ["count", "table"]) {
				this.view.$evaluation[name].innerText = _prettyCount(this.eval[name]);
			}
			this.view.$evaluation.depth.innerText = this.eval.depth + "/" + (this.eval.pv ? this.eval.pv.length : "-");
			this.view.$evaluation.time.innerText = this.evaluationEndTime - this.evaluationStartTime;
			this.view.$evaluation.pv.setAttribute("title", "Principal variation: " + (this.view.$evaluation.pv.innerText = this._principalVariationString()));
		}
	};

	Game.prototype.redraw = function() {
		var prevHistory = this.historyIndex > 0 ? this.historyMoves[this.historyIndex - 1] : null;
		for (var i = 0; i < this.board.width * this.board.height; i++) {
			var id = this.board._flipPiece(i, this.currentFlip);
			var $cell = this.view.$cells[i], piece = this.board.board[id];
			$cell.classList[piece == Board.CONST.P1 ? "add" : "remove"]("p1");
			$cell.classList[piece == Board.CONST.P2 ? "add" : "remove"]("p2");
			$cell.classList[this.chosen == id ? "add" : "remove"]("chosen");
			$cell.classList[this.historyIndex > 0 && (prevHistory.from == id || prevHistory.to == id) ? "add" : "remove"]("highlight");
		}

		var $events = this.view.$history.querySelectorAll("div.event");
		var diff = $events.length - 1 - this.historyMoves.length;
		if (diff < 0) {
			var $event = document.createElement("div");
			$event.classList.add("event");
			$event.dataset.index = this.historyIndex;
			this.view.$history.insertBefore($event, this.view.$historyResult);
		} else {
			while (diff-- > 0) {
				this.view.$history.removeChild($events[$events.length - 1 - diff]);
			}
		}
		this.view.$history.querySelectorAll("div.active").forEach(function(e) {
			e.classList.remove("active");
		});
		if (this.historyIndex > 0) {
			var $event = this.view.$history.querySelectorAll("div.event")[this.historyIndex];
			$event.classList.add("active");
			$event.innerHTML = (
				"<span>" + (this.historyIndex % 2 == 1 ? (this.historyIndex + 1) / 2 + ". " : "") + "</span>" +
				"<span>" + this._nameMove(prevHistory) + "</span>"
			);
		} else {
			this.view.$history.querySelectorAll("div.event")[0].classList.add("active");
		}
		var $eventActive = this.view.$history.querySelector("div.active");
		this.view.$history.scrollTop = $eventActive.offsetTop - this.view.$history.clientHeight / 2;

		if (this.isFinished()) {
			if (this.board.pieces[Board.CONST.P1].length != 0 && this.board.pieces[Board.CONST.P2].length == 0) {
				this.view.$playerControl[Board.CONST.P1].classList.add("winner");
				this.view.$playerControl[Board.CONST.P1].classList.remove("draw");
				this.view.$historyResult.innerText = "1-0";
			} else if (this.board.pieces[Board.CONST.P2].length != 0 && this.board.pieces[Board.CONST.P1].length == 0) {
				this.view.$playerControl[Board.CONST.P2].classList.add("winner");
				this.view.$playerControl[Board.CONST.P2].classList.remove("draw");
				this.view.$historyResult.innerText = "0-1";
			} else {
				this.view.$playerControl[Board.CONST.P1].classList.add("draw");
				this.view.$playerControl[Board.CONST.P1].classList.remove("winner");
				this.view.$playerControl[Board.CONST.P2].classList.add("draw");
				this.view.$playerControl[Board.CONST.P2].classList.remove("winner");
				this.view.$historyResult.innerText = "\u00bd-\u00bd";
			}
			this.view.$playerControl[Board.CONST.P1].classList.remove("turn");
			this.view.$playerControl[Board.CONST.P2].classList.remove("turn");
			this.view.$historyResult.classList.add("finish");
		} else {
			this.view.$playerControl[this.board.side].classList.remove("winner", "draw");
			this.view.$playerControl[this.board.side].classList.add("turn");
			this.view.$playerControl[Board.opponentOf(this.board.side)].classList.remove("winner", "draw", "turn");
			this.view.$historyResult.classList.remove("finish");
		}

		this.redrawEvaluation();
	};

	// worker thread
	Game.prototype.initWorker = function() {
		try {
			if (!ENABLE_WORKER) throw new Error("ENABLE_WORKER is set to false");
			var blob = new Blob([
				'importScripts("' + window.location.href.substr(0, location.href.lastIndexOf("/")) + '/board.js");',
				'importScripts("' + window.location.href.substr(0, location.href.lastIndexOf("/")) + '/zobrist.js");',
				'var timeoutId = null, boardCode = null, evalProcess = null;',
				'function evaluate() {',
					'var evalResult = Board.evaluationYield(evalProcess);',
					'evalResult.code = boardCode;',
					'postMessage(evalResult);',
					'if (!evalResult.done) {',
						'timeoutId = setTimeout(function() {',
							'evaluate();',
						'}, 1);',
					'}',
				'}',
				'onmessage = function(e) {',
					'if (e.data.action === "RESET_TABLE") {',
						'Board.resetTranspositionTable();',
					'} else if (e.data.action === "SET_TABLE_MAX_SIZE") {',
						'Board.setTranspositionTableMaxSize(e.data.value);',
					'} else if (e.data.action === "EVALUATE") {',
						'if (timeoutId != null) {',
							'clearTimeout(timeoutId);',
							'timeoutId = boardCode = evalProcess = null;',
						'}',
						'if (e.data.code != null) {',
							'evalProcess = Board.fromCode(boardCode = e.data.code).evaluate(e.data.timeout, e.data.depth);',
							'evaluate();',
						'}',
					'} else {',
						'console.error("Unknown action: " + e.data.action)',
					'}',
				'};'
			], {type: 'text/javascript'});
			var blobUrl = window.URL.createObjectURL(blob);

			var that = this;
			this.worker = new Worker(blobUrl);
			this.worker.onmessage = function(e) {
				that.intermediateEvaluation(e.data);
			};
		} catch (e) {
			console.error("Worker creation failed", e);
		}
		this.evaluating = false;
		this.evaluatingCode = null;
		this.evaluatedPartially = false;
	};

	Game.prototype.startEvaluation = function() {
		this.unscheduleComputerPlay();
		this.evaluating = true;
		this.evaluatingCode = this.board.toCode();
		this.evaluatedPartially = false;
		this.evaluationStartTime = Math.floor(Date.now() / 1000);
		this.evaluationEndTime = this.evaluationStartTime;
		var timeout = +this.view.$timeSetting.value || 500;
		var depth = +this.view.$depthSetting.value || 4;
		if (this.worker) {
			this.worker.postMessage({action: "EVALUATE", code: this.board.toCode(), timeout: timeout, depth: depth});
		} else {
			this.evalProcess = this.board.evaluate(timeout, depth);
			this.intermediateEvaluation({code: this.evaluatingCode});
		}
	};

	Game.prototype.intermediateEvaluation = function(evalResult) {
		if (!this.evaluating || evalResult.code != this.evaluatingCode) return;
		if (evalResult.done) {
			this.endEvaluation(evalResult.value);
			return;
		}
		var evaluationEndTime = Math.floor(Date.now() / 1000);
		if (evalResult.value != null) {
			this.eval = evalResult.value;
			this.evaluatedPartially = true;
			this.evaluationEndTime = evaluationEndTime;
			this.redrawEvaluation();
		} else if (evaluationEndTime != this.evaluationEndTime) {
			this.evaluationEndTime = evaluationEndTime;
			this.redrawEvaluation();
		}
		var that = this;
		if (!this.worker) {
			if (this.evaluationTimeoutId != null) clearTimeout(this.evaluationTimeoutId);
			this.evaluationTimeoutId = setTimeout(function() {
				var result = Board.evaluationYield(that.evalProcess);
				result.code = evalResult.code;
				that.intermediateEvaluation(result);
			}, 50);
		}
	};

	Game.prototype.interruptEvaluation = function() {
		if (!this.evaluating || !this.evaluatedPartially) return;
		this.endEvaluation(null);
	};

	Game.prototype.endEvaluation = function(eval) {
		this.evaluating = false;
		this.evaluatingCode = null;
		this.evaluatedPartially = false;
		this.evaluationEndTime = Math.floor(Date.now() / 1000);
		if (this.worker) this.worker.postMessage({action: "EVALUATE"});
		else {
			clearTimeout(this.evaluationTimeoutId);
			this.evaluationTimeoutId = null;
			this.evalProcess = null;
		}
		if (eval) this.eval = eval;
		this.scheduleComputerPlay();
		this.redraw();
	};

	Game.CONST = {
		MOVES_TO_DRAW: MOVES_TO_DRAW
	};

	return Game;

})();
