const MOVES_TO_DRAW = 50;

var Game = (function() {

	const MIN_COMPUTER_PLAY_DELAY = 100;
	const ENABLE_WORKER = true;

	const HUMAN_PLAYER_LABEL = "HUMAN";

	function _nameIndex(index) {
		var x = index % WIDTH;
		var y = index / WIDTH | 0;
		return String.fromCharCode("a".charCodeAt(0) + x) + (HEIGHT - y);
	}

	// Game
	function Game($div, boardCode, flip) {
		this.view = {
			$div: $div,
			$cells: []
		};

		this.control = [];
		this.initWorker();
		this.firstDraw();
		this.newGame(boardCode, flip);
		this.resetHumanPlayers();
		this.redraw();
	}

	Game.prototype.newGame = function(boardCode, flip) {
		this.historyMoves = [];
		this.historyFlips = [];
		this.historyCodes = [];
		this.historyCapture = [];
		this.currentFlip = flip || FLIP_NULL;
		this.historyIndex = 0;

		this.chosen = null;
		this.board = Board.fromCode(boardCode);
		this.historyCodes.push(this.board._encode());
		this.startEvaluation();
	};

	Game.prototype.isFinished = function() {
		return this.board.pieces[P1].length == 0 || this.board.pieces[P2].length == 0
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
		if (this.eval.move != null && !this.isFinished()) {
			this.play(this.eval.move.from, this.eval.move.to);
		}
	};

	// Game moves
	Game.prototype.play = function(from, to) {
		var moves = this.board.moves();
		var matchedMove = null, matchedFlip = null;
		if (from == to) {
			if (moves.length == 1 && moves[0].from == null) {
				matchedMove = moves[0];
			}
		} else {
			nodeLoop: {
				this.board._checkFlip();
				for (var dir of [FLIP_NULL, FLIP_H, FLIP_V]) {
					if (!this.board.flip[dir]) continue;
					var flippedFrom = _flip(from, dir);
					var flippedTo = _flip(to, dir);
					for (var move of moves) {
						if (move.from == flippedFrom && move.to == flippedTo) {
							matchedMove = move;
							matchedFlip = dir;
							break nodeLoop;
						}
					}
				}
				if (this.board.flip[FLIP_H] && this.board.flip[FLIP_V]) {
					var flippedFrom = _flip(from, FLIP_H | FLIP_V);
					var flippedTo = _flip(to, FLIP_H | FLIP_V);
					for (var move of moves) {
						if (move.from == flippedFrom && move.to == flippedTo) {
							matchedMove = child;
							matchedFlip = FLIP_H | FLIP_V;
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
			this.historyCodes.length = this.historyIndex;

			this.historyMoves.push(matchedMove);
			this.historyFlips.push(matchedFlip);
			this.historyCodes.push(this.board._encode());
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
		this.resetHumanPlayers();
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
		this.resetHumanPlayers();
		this.startEvaluation();
		this.chosen = null;
		this.redraw();
	};

	Game.prototype.resetHumanPlayers = function() {
		this.control[P1] = this.control[P2] = HUMAN_PLAYER_LABEL;
		this.view.$playerControl[P1].classList.add("human");
		this.view.$playerControl[P2].classList.add("human");
	};

	Game.prototype.choose = function(id) {
		if (this.chosen != null) this.view.$cells[_flip(this.chosen, this.currentFlip)].classList.remove("chosen");
		this.chosen = id;
		if (this.chosen != null) this.view.$cells[_flip(this.chosen, this.currentFlip)].classList.add("chosen");
	};

	// Game UI
	Game.prototype.firstDraw = function() {
		var that = this;
		window.addEventListener("keydown", function(e) {
			switch (e.key) {
				case "Left":
				case "ArrowLeft":
					if (!e.target.matches("input")) that.undo(1);
					break;
				case "Right":
				case "ArrowRight":
					if (!e.target.matches("input")) that.redo(1);
					break;
			}
		});

		var $table = this.view.$div.querySelector("table");
		for (var j = 0; j < HEIGHT; j++) {
			var $row = document.createElement("tr");
			var $cell = document.createElement("td");
			$cell.innerText = j + 1;
			$row.appendChild($cell);
			for (var i = 0; i < WIDTH; i++) {
				var $cell = document.createElement("td");
				$cell.dataset.id = j * WIDTH + i;
				$row.appendChild($cell);
				this.view.$cells.push($cell);
			}
			$table.appendChild($row);
		}
		var $row = document.createElement("tr");
		$row.appendChild(document.createElement("td"));
		for (var i = 0; i < WIDTH; i++) {
			var $cell = document.createElement("td");
			$cell.innerText = String.fromCharCode("a".charCodeAt(0) + i);
			$row.appendChild($cell);
		}
		$table.appendChild($row);
		$table.addEventListener("click", function(e) {
			if (!e.target.matches("td")) return;
			if (that.isFinished() || that.control[that.board.side] != HUMAN_PLAYER_LABEL) return;
			var id = +e.target.dataset.id;
			id = _flip(id, that.currentFlip);
			if (that.chosen == null) {
				if (that.board.board[id] == that.board.side) that.choose(id);
			} else {
				if (that.chosen == id) that.play(id, id); // attempt a pass
				else if (that.board.board[id] == that.board.side) that.choose(id);
				else if (that.board.board[id] == _opponent(that.board.side)) that.choose(null);
				else that.play(that.chosen, id);
			}
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
			this.classList.toggle("hide");
			_saveSettings();
		});
		for (var name of ["score", "count", "table", "depth"]) {
			this.view.$evaluation[name] = this.view.$evaluation.wrapper.querySelector("." + name);
		}
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
			$playerControl.classList[e.target.dataset.value == HUMAN_PLAYER_LABEL ? "add" : "remove"]("human");
			that.control[$playerControl.dataset.player] = e.target.dataset.value;
			that.scheduleComputerPlay();
		});
		this.view.$playerControl[P1] = this.view.$playerControl.wrapper.querySelectorAll("div.player-control")[0];
		this.view.$playerControl[P1].dataset.player = P1;
		this.view.$playerControl[P2] = this.view.$playerControl.wrapper.querySelectorAll("div.player-control")[1];
		this.view.$playerControl[P2].dataset.player = P2;

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

		this.view.$div.querySelector("button.button-new-game").addEventListener("click", function(e) {
			if (e.ctrlKey || confirm("New game?")) {
				that.newGame();
				that.redraw();
			}
		});
		this.view.$div.querySelector("button.button-undo-all").addEventListener("click", function() { that.undo(Infinity); });
		this.view.$div.querySelector("button.button-undo").addEventListener("click", function() { that.undo(1); });
		this.view.$div.querySelector("button.button-redo").addEventListener("click", function() { that.redo(1); });
		this.view.$div.querySelector("button.button-redo-all").addEventListener("click", function() { that.redo(Infinity); });
		this.view.$div.querySelector("button.button-new-analysis").addEventListener("click", function() {
			window.open("#analysis=" + that.board._encode() + that.currentFlip);
		});

		function _saveSettings() {
			try {
				localStorage.setItem("gameSettings", JSON.stringify({
					computerSettingsCollapse: $computerSettings.classList.contains("collapse"),
					evaluationHide: that.view.$evaluation.wrapper.classList.contains("hide"),
					timeSettingValue: that.view.$timeSetting.value,
					depthSettingValue: that.view.$depthSetting.value,
				}));
			} catch (e) {
			}
		}
		(function _loadSettings() {
			try {
				var settings = JSON.parse(localStorage.getItem("gameSettings"));
				if (settings == null) return;
				if (settings.computerSettingsCollapse) $computerSettings.classLsit.add("collapse");
				if (settings.evaluationHide) that.view.$evaluation.wrapper.classList.add("hide");
				that.view.$timeSetting.value = settings.timeSettingValue;
				that.view.$depthSetting.value = settings.depthSettingValue;
			} catch (e) {
			}
		})();
	};

	Game.prototype.redraw = function() {
		var prevHistory = this.historyIndex > 0 ? this.historyMoves[this.historyIndex - 1] : null;
		for (var i = 0; i < WIDTH * HEIGHT; i++) {
			var id = _flip(i, this.currentFlip);
			var $cell = this.view.$cells[i], piece = this.board.board[id];
			$cell.classList.remove("highlight", "chosen", "p1", "p2");
			if (piece != 0) $cell.classList.add("p" + piece);
			if (this.chosen == id) $cell.classList.add("chosen");
			if (this.historyIndex > 0 && (prevHistory.from == id || prevHistory.to == id)) $cell.classList.add("highlight");
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
				"<span>" +
					(prevHistory.from == null
						? "PASS"
						: _nameIndex(_flip(prevHistory.from, this.currentFlip)) + _nameIndex(_flip(prevHistory.to, this.currentFlip)) + (prevHistory.taken.length > 0 ? "+" : "")) +
				"</span>"
			);
		} else {
			this.view.$history.querySelectorAll("div.event")[0].classList.add("active");
		}
		var $eventActive = this.view.$history.querySelector("div.active");
		this.view.$history.scrollTop = $eventActive.offsetTop - this.view.$history.clientHeight / 2;

		if (this.isFinished()) {
			if (this.board.pieces[P1].length != 0 && this.board.pieces[P2].length == 0) {
				this.view.$playerControl[P1].classList.add("winner");
				this.view.$playerControl[P1].classList.remove("draw");
				this.view.$historyResult.innerText = "1-0";
			} else if (this.board.pieces[P2].length != 0 && this.board.pieces[P1].length == 0) {
				this.view.$playerControl[P2].classList.add("winner");
				this.view.$playerControl[P2].classList.remove("draw");
				this.view.$historyResult.innerText = "0-1";
			} else {
				this.view.$playerControl[P1].classList.add("draw");
				this.view.$playerControl[P1].classList.remove("winner");
				this.view.$playerControl[P2].classList.add("draw");
				this.view.$playerControl[P2].classList.remove("winner");
				this.view.$historyResult.innerText = "\u00bd-\u00bd";
			}
			this.view.$playerControl[P1].classList.remove("turn");
			this.view.$playerControl[P2].classList.remove("turn");
			
			this.view.$historyResult.classList.add("finish");
		} else {
			this.view.$playerControl[this.board.side].classList.remove("winner", "draw");
			this.view.$playerControl[this.board.side].classList.add("turn");
			this.view.$playerControl[_opponent(this.board.side)].classList.remove("winner", "draw", "turn");
			this.view.$historyResult.classList.remove("finish");
		}

		this.view.$status.classList[this.evaluating ? "add" : "remove"]("busy");
		this.view.$interrupt.classList[this.evaluating ? "add" : "remove"]("busy");
		if (this.eval != null) {
			this.view.$evaluation.score.innerText = (
				(Math.abs(this.eval.score) >= MATE_BASE
					? (this.eval.score > 0 ? "M" : "-M") + ((MATE_SCORE - Math.abs(this.eval.score) + 1) >> 1)
					: this.eval.score / 100)
			);
			for (var name of ["count", "table", "depth"]) {
				this.view.$evaluation[name].innerText = this.eval[name];
			}
		}
	};

	// worker thread
	Game.prototype.initWorker = function() {
		try {
			if (!ENABLE_WORKER) throw new Error("ENABLE_WORKER is set to false");
			var blob = new Blob([
				'importScripts("' + window.location.href.substr(0, location.href.lastIndexOf("/")) + '/endgame.js");',
				'importScripts("' + window.location.href.substr(0, location.href.lastIndexOf("/")) + '/board.js");',
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
					'if (timeoutId != null) {',
						'clearTimeout(timeoutId);',
						'timeoutId = boardCode = evalProcess = null;',
					'}',
					'if (e.data.code != null) {',
						'evalProcess = Board.fromCode(boardCode = e.data.code).evaluate(e.data.timeout, e.data.depth, e.data.repeats);',
						'evaluate();',
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
		this.evaluatingCode = this.board._encode();
		this.evaluatedPartially = false;
		var timeout = +this.view.$timeSetting.value || 500;
		var depth = +this.view.$depthSetting.value || 4;
		var repeats = {};
		for (var i = this.historyIndex; i >= 0; i--) {
			repeats[this.historyCodes[i]] = (repeats[this.historyCodes[i]] || 0) + 1;
			if (i > 0 && this.historyCapture[i - 1] == 0) break;
		}
		if (this.worker) {
			this.worker.postMessage({code: this.board._encode(), timeout: timeout, depth: depth, repeats: repeats});
		} else {
			this.evalProcess = this.board.evaluate(timeout, depth, repeats);
			this.intermediateEvaluation({code: this.evaluatingCode});
		}
	};

	Game.prototype.intermediateEvaluation = function(evalResult) {
		if (!this.evaluating || evalResult.code != this.evaluatingCode) return;
		if (evalResult.done) {
			this.endEvaluation(evalResult.value);
			return;
		}
		if (evalResult.value != null) {
			this.eval = evalResult.value;
			this.evaluatedPartially = true;
			this.redraw();
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
		if (this.worker) this.worker.postMessage({});
		else {
			clearTimeout(this.evaluationTimeoutId);
			this.evaluationTimeoutId = null;
			this.evalProcess = null;
		}
		if (eval) this.eval = eval;
		this.scheduleComputerPlay();
		this.redraw();
	};

	return Game;

})();
