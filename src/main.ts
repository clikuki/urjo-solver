const enum CELL_STATE { A, B, UNSET }

interface LimitNode
{
	limit: number,
	counting: number[];
}
type LimitEntry = [number, number[]];

class GridData
{
	private _data: CELL_STATE[];
	
	// Columns first, then rows.
	private _lines: number[][];
	// Also column-row, but line is represented by masks of each state
	private _lineBits: Uint8Array;
	// Also column-row, but stores tuples of states
	private _lineCounts: [number, number, number][];

	private _limits: number[] = [];
	private _limitMap: LimitNode[] = [];

	public getLineIndicesAt(i: number, isRow: boolean): readonly number[]
	{
		if(isRow) i += this.size;
		return this._lines[i];
	}
	
	public getLineMasksAt(i: number, isRow: boolean): readonly [number, number]
	{
		i = i * 2
		if(isRow) i += this.size + this.size;
		return [this._lineBits[i], this._lineBits[i + 1]]
	}
	
	public getLineCountsAt(i: number, isRow: boolean): readonly [number, number, number]
	{
		if(isRow) i += this.size;
		return this._lineCounts[i];
	}
	
	public readonly cellCnt: number;
	constructor(public readonly size: number)
	{
		if (size < 4 || size % 2) throw new Error("Grid size must be even and at least 4");

		this.cellCnt = size * size;
		this._data = Array(this.cellCnt).fill(0).map(_ => CELL_STATE.UNSET);
		this._lines = Array(size) // Indices per line
			.fill(0)
			.map((_, y) => Array(size).fill(0).map((_, x) => x + y * size))
		this._lines = Array(size)
			.fill(0)
			.map((_, x) => Array(size).fill(0).map((_, y) => x + y * size))
			.concat(this._lines);
		this._lineBits = new Uint8Array(size * 4);
		this._lineCounts = Array(size + size)
			.fill(0)
			.map(() => [0, 0, size]);
	}

	public static fromString(preset: string): GridData {
		const [size, cells, limits] = this._parsePresetString(preset);
		const gridData = new this(size);
		
		if(cells) gridData.parseStringStates(cells);
		if(limits) gridData.setAllLimits(limits);

		return gridData;
	}

	private static _parsePresetString(preset: string): [number, string?, [number, number][]?] {
		const [sizeStr, cells, limStr] = preset.split("/");

		const size = +sizeStr;
		if(!sizeStr || isNaN(size)) throw new SyntaxError("Preset must contain a size.");

		const limits: [number, number][] = [];
		if(limStr) {
			const parts = limStr.split(",").map(e => e.split(":")) as [string, string][];
			for(const [a, b] of parts) {
				const c = +a, d = +b;
				if(!a || !b || isNaN(c) || isNaN(d)) throw new SyntaxError("Preset limit syntax is invalid.");
				limits.push([c,d]);
			}
		}

		return [size, cells, limits.length ? limits : undefined]
	}

	public getState(idx: number): CELL_STATE
	{
		return this._data[idx];
	}

	public setState(idx: number, newState: CELL_STATE): void
	{
		if (this._data[idx] === newState) return;
		const oldState = this._data[idx];
		this._data[idx] = newState;
 
		const x = idx % this.size;
		const y = Math.floor(idx / this.size);
		
		// State counts
		this._lineCounts[x][oldState]--;
		this._lineCounts[x][newState]++;
		this._lineCounts[y + this.size][oldState]--;
		this._lineCounts[y + this.size][newState]++;

		// Line Masks
		const listX = x * 2;
		const listY = y * 2 + this.size + this.size;
		const colMask = 1 << y;
		const rowMask = 1 << x;

		if(newState === CELL_STATE.A) {
			this._lineBits[listX] = this._lineBits[listX] | colMask;
			this._lineBits[listY] = this._lineBits[listY] | rowMask;
		}
		else {
			this._lineBits[listX] = this._lineBits[listX] & ~colMask;
			this._lineBits[listY] = this._lineBits[listY] & ~rowMask;
		}
		
		if(newState === CELL_STATE.B) {
			this._lineBits[listX+1] = this._lineBits[listX+1] | colMask;
			this._lineBits[listY+1] = this._lineBits[listY+1] | rowMask;
		}
		else {
			this._lineBits[listX+1] = this._lineBits[listX+1] & ~colMask;
			this._lineBits[listY+1] = this._lineBits[listY+1] & ~rowMask;
		}
	}

	public getLimitedCells(): readonly number[]
	{
		return this._limits;
	}

	public getLimitCount(idx: number): number
	{
		const node = this._limitMap[idx];
		if (!node) return -1;
		return node.limit;
	}

	public getLimitNeighbors(idx: number): number[]
	{
		const node = this._limitMap[idx];
		if (!node) return [];
		return node.counting;
	}

	public setAllLimits(limitList: [idx: number, limit: number][]): void
	{
		this._limitMap.length = 0;
		this._limits.length = 0;

		for (const [idx, limit] of limitList)
		{
			this.setLimit(idx, limit);
		}
	}

	public setLimit(idx: number, limit: number): void {
		if (idx < 0) throw new Error(`Limit index #${idx} is negative.`);
		if (idx >= this.cellCnt) throw new Error(`Limit index #${idx} exceeds ${this.cellCnt - 1}.`);
		if (limit > 8) throw new Error(`Limit at index #${idx} exceeds 8.`);
		if (limit < 0) throw new Error(`Limit at index #${idx} is negative.`);

		const x = idx % this.size;
		const y = Math.floor(idx / this.size);
		const atLeft = x === 0;
		const atRight = x === this.size - 1;
		const atTop = y === 0;
		const atBottom = y === this.size - 1;
		if ((atLeft || atRight) && (atTop || atBottom) && limit > 3)
		{
			throw new Error(`Corner limit at index #${idx} exceeds 3.`);
		}
		if ((atLeft || atRight || atTop || atBottom) && limit > 5)
		{
			throw new Error(`Edge limit at index #${idx} exceeds 5.`);
		}

		const counting: number[] = [];
		if (!atLeft) counting.push(idx - 1);
		if (!atRight) counting.push(idx + 1);
		if (!atTop) counting.push(idx - this.size);
		if (!atBottom) counting.push(idx + this.size);
		if (!(atLeft || atTop)) counting.push(idx - this.size - 1);
		if (!(atRight || atTop)) counting.push(idx - this.size + 1);
		if (!(atLeft || atBottom)) counting.push(idx + this.size - 1);
		if (!(atRight || atBottom)) counting.push(idx + this.size + 1);

		if(!this._limits.includes(idx)) this._limits.push(idx);

		this._limitMap[idx] = {
			limit,
			counting,
		}
	}

	public removeLimit(idx: number): void {
		if(!this._limitMap[idx]) return;
		this._limits = this._limits.filter(l => l !== idx);
		delete this._limitMap[idx];
	}

	public countNeighbors(): [number, number][] {
		const surr: [number, number][] = [];
		for(let idx = 0; idx < 36; idx++) {
			const neighbors = [];
			const x = idx % this.size;
			const y = Math.floor(idx / this.size);
			const atLeft = x === 0;
			const atRight = x === this.size - 1;
			const atTop = y === 0;
			const atBottom = y === this.size - 1;

			if (!atLeft) neighbors.push(idx - 1);
			if (!atRight) neighbors.push(idx + 1);
			if (!atTop) neighbors.push(idx - this.size);
			if (!atBottom) neighbors.push(idx + this.size);
			if (!(atLeft || atTop)) neighbors.push(idx - this.size - 1);
			if (!(atRight || atTop)) neighbors.push(idx - this.size + 1);
			if (!(atLeft || atBottom)) neighbors.push(idx + this.size - 1);
			if (!(atRight || atBottom)) neighbors.push(idx + this.size + 1);

			const counts = [0, 0, 0];
			for (const neighbor of neighbors)
			{
				const state = this.getState(neighbor);
				counts[state]++;
			}

			const state = this.getState(idx);
			surr.push([idx, counts[state]]);
		}
		return surr;
	}

	public parseStringStates(
		dataString: string,
		charA = "a",
		charB = "b",
		charU = "_"
	): void
	{
		if (charA.length !== 1 || charB.length !== 1 || charU.length !== 1)
		{
			throw new Error("State key must be one character only.");
		}

		let idx = 0;
		let state: CELL_STATE;
		for (const char of dataString)
		{
			if (char === charA) state = CELL_STATE.A;
			else if (char === charB) state = CELL_STATE.B;
			else if (char === charU) state = CELL_STATE.UNSET;
			else continue;

			this.setState(idx++, state);
			if (idx >= this.cellCnt) return;
		}

		// Clear remaining cells, if any
		while (idx < this.cellCnt)
		{
			this.setState(idx++, CELL_STATE.UNSET);
		}
	}

	public toString(): string
	{
		let str = `${this.size}/`;

		// cell states
		for (let idx = 0; idx < this.cellCnt; idx++)
		{
			// if (idx && idx % this.size === 0) str += "\n";
			const state = this.getState(idx);
			switch (state)
			{
				case CELL_STATE.A:
					str += "a";
					break;
				case CELL_STATE.B:
					str += "b";
					break;
				case CELL_STATE.UNSET:
					str += "_";
					break;
			}
		}

		// cell limits
		const limStrings: string[] = [];
		for(const idx of this._limits) {
			const limCnt = this.getLimitCount(idx);
			if(limCnt < 0) continue;
			limStrings.push(`${idx}:${limCnt}`);
		}
		str += "/" + limStrings.join(",");

		return str;
	}
}

interface CollapsePoint {
	lowest: number[];
	grid: string,
	domain: string,
}

type Constraint = LineConstraint | AdjacencyConstraint | LimitConstraint;
interface LineConstraint
{
	type: "LINE";
	isRow: boolean;
	lineIdx: number;
}
interface AdjacencyConstraint
{
	type: "ADJACENT";
	isRow: boolean;
	aIdx: number;
	bIdx: number;
}
interface LimitConstraint
{
	type: "LIMIT";
	source: number;
	count: number;
	counting: number[];
}

class Solver
{
	public isComplete = false;
	public stopAfterFirstSolution = true;
	public solutions: string[] = [];

	private collapseStack: CollapsePoint[] = [];
	private domains: Record<CELL_STATE.A | CELL_STATE.B, boolean>[] = [];
	private allConstraints: Constraint[] = [];
	private localConstraints = new Map<number, Constraint[]>();

	constructor(private grid: GridData) {
		this.useGrid(grid);
	}

	public useGrid(grid: GridData)
	{
		this.grid = grid;
		this.collapseStack.length = 0;
		this.domains.length = 0;
		this.isComplete = false;
		this.solutions.length = 0;
		this._createConstraints();

		const emptyIndices: number[] = [];
		for (let idx = 0; idx < grid.cellCnt; idx++)
		{
			const state = grid.getState(idx);
			this.domains[idx] = {
				[CELL_STATE.A]: state !== CELL_STATE.B,
				[CELL_STATE.B]: state !== CELL_STATE.A,
			};
			
			if (state === CELL_STATE.UNSET)
			{
				emptyIndices.push(idx);
				this._updateDomain(idx);
			}
		}
	}

	public step(): void
	{
		if(this.isComplete) return;

		const { entropy, indices } = this._findLeastEntropy();
		// console.log(entropy, indices);

		if (entropy === 1)
		{
			for (const idx of indices)
			{
				this.grid.setState(idx, this._getStateToUse(idx));
			}

			this._updateSurroundingDomain(indices);
		}
		else if(entropy === 2)
		{
			// Create new collapse point, then try first index
			const idx = indices.pop()!;

			this.collapseStack.push({
				lowest: indices,
				grid: this.grid.toString(),
				domain: JSON.stringify(this.domains),
			});

			this.grid.setState(idx, this._getStateToUse(idx));
			this._updateSurroundingDomain([idx]);
			// for(let i = 0; i < this.grid.cellCnt; i++){
			// 	if(this.grid.getState(i) !== CELL_STATE.UNSET) continue;
			// 	console.log(`${i} : `, this.domains[i]);
			// }
		}
		else {
			// Either 1. dead-end (entropy = 0) or 2. one solution found (entropy = 3)
			// Either case, backtrack to last collapse point

			if(entropy !== 0 && this._isValid()) {
				this.solutions.push(this.grid.toString());
				console.log(this.solutions.at(-1));
				if(this.stopAfterFirstSolution) {
					this.isComplete = true;
					return;
				}
			}

			let collapsed: CollapsePoint | undefined;
			while(!collapsed) {
				collapsed = this.collapseStack.at(-1);
				// console.log(collapsed);
				if(!collapsed) {
					this.isComplete = true;
					return;
				}

				const idx = collapsed.lowest.pop();
				if(idx !== undefined) {
					this.grid.parseStringStates(collapsed.grid);
					this.domains = JSON.parse(collapsed.domain);
					this.grid.setState(idx, this._getStateToUse(idx));
					this._updateSurroundingDomain([idx]);
				}
				else {
					this.collapseStack.pop();
					collapsed = undefined;
				}
			}
		}

		// console.log(this.collapseStack.length, this.collapseStack)
	}

	private _getStateToUse(idx: number): CELL_STATE {
		if(this.domains[idx][CELL_STATE.A]) return CELL_STATE.A;
		else return CELL_STATE.B;
	}

	private _createConstraints(): void
	{
		this.allConstraints.length = 0;
		this.localConstraints.clear();

		const size = this.grid.size;
		for (let i = 0; i < size; i++) {
			this.allConstraints.push({
				type: "LINE",
				isRow: false,
				lineIdx: i,
			}, {
				type: "LINE",
				isRow: true,
				lineIdx: i,
			})
		}

		for (let i = 1; i < size; i++)
		{
			this.allConstraints.push({
				type: "ADJACENT",
				isRow: false,
				aIdx: i - 1,
				bIdx: i,
			}, {
				type: "ADJACENT",
				isRow: true,
				aIdx: i - 1,
				bIdx: i,
			});
		}

		const limitIndices = this.grid.getLimitedCells();
		for (const idx of limitIndices)
		{
			const limit = this.grid.getLimitCount(idx);
			const neighbors = this.grid.getLimitNeighbors(idx);
			this.allConstraints.push({
				type: "LIMIT",
				source: idx,
				count: limit,
				counting: neighbors,
			})
		}

		for (const constraint of this.allConstraints)
		{
			switch(constraint.type) {
				case "LINE":
					const indices = this.grid.getLineIndicesAt(constraint.lineIdx, constraint.isRow);
					for (const idx of indices)
					{
						this._pushToMapArr(idx, constraint);
					}
					break;

				case "ADJACENT":
					const aIndices = this.grid.getLineIndicesAt(constraint.aIdx, constraint.isRow);
					const bIndices = this.grid.getLineIndicesAt(constraint.bIdx, constraint.isRow);
					for (let i = 0; i < size; i++)
					{
						this._pushToMapArr(aIndices[i], constraint);
						this._pushToMapArr(bIndices[i], constraint);
					}
					break;

				case "LIMIT":
					this._pushToMapArr(constraint.source, constraint);
					for (const idx of constraint.counting)
					{
						this._pushToMapArr(idx, constraint);
					}
					break;

				default:
					throw new Error("Unhandled constraint during creation.");
			}
		}
	}

	private _updateSurroundingDomain(indices: number[]): void {
		const affected: boolean[] = [];
		for(const idx of indices) this._setAffected(idx, affected);

		let updated;
		do {
			updated = false;

			for(let i = 0; i < this.grid.cellCnt; i++) {
				if(!affected[i] || this.grid.getState(i) !== CELL_STATE.UNSET) continue;

				if(this._updateDomain(i)) {
					this._setAffected(i, affected);
					updated = true;
				}
			}
		}
		while(updated);
	}

	private _setAffected(idx: number, affected: boolean[]): void {
		const constraints = this.localConstraints.get(idx)!;
		for(const constraint of constraints) {
			switch(constraint.type) {
				case "LINE":
					const indices = this.grid.getLineIndicesAt(constraint.lineIdx, constraint.isRow);
					for(const i of indices) affected[i] = true;
					break;

				case "ADJACENT":
					break;

				case "LIMIT":
					affected[constraint.source] = true;
					for(const i of constraint.counting) affected[i] = true;
					break;

				default:
					throw new Error("Invalid constraint during domain updating.");
			}
		}
	}

	private _updateDomain(idx: number): boolean
	{
		const domain = this.domains[idx];
		const constraints = this.localConstraints.get(idx)!;
		let changed = false;
		for (const state of [CELL_STATE.A, CELL_STATE.B] as const)
		{
			if (!domain[state]) continue;

			this.grid.setState(idx, state);

			for (const constraint of constraints)
			{
				switch(constraint.type) {
					case "LINE": {
						const counts = [0, 0],
							half = this.grid.size / 2,
							indices = this.grid.getLineIndicesAt(constraint.lineIdx, constraint.isRow);

						for(const i of indices) {
							const cellState = this.grid.getState(i);
							if(cellState !== CELL_STATE.UNSET && ++counts[cellState] > half) {
								domain[state] = false;
								break;
							}
						}

						break;}

					case "ADJACENT":{
						const half = this.grid.size / 2,
							aMasks = this.grid.getLineMasksAt(constraint.aIdx, constraint.isRow),
							bMasks = this.grid.getLineMasksAt(constraint.bIdx, constraint.isRow),
							counts = this.grid.getLineCountsAt(constraint.bIdx, constraint.isRow);

						if(
							(counts[0] === half && (aMasks[0] === bMasks[0])) ||
							(counts[1] === half && (aMasks[1] === bMasks[1]))
						) domain[state] = false;

						break;}

					case "LIMIT":{
						const limit = constraint.count;
						const sourceState = this.grid.getState(constraint.source);

						const counts = [0, 0, 0];
						for (const i of constraint.counting)
						{
							const state = this.grid.getState(i);
							counts[state]++;
						}

						if(
							sourceState === CELL_STATE.UNSET && 
							counts[CELL_STATE.A] > limit &&
							counts[CELL_STATE.B] > limit
							||
							sourceState !== CELL_STATE.UNSET && (
								counts[sourceState] > limit ||
								counts[sourceState] + counts[CELL_STATE.UNSET] < limit)
						) {
							domain[state] = false;
						}

						break;}

					default: throw new Error("Invalid local constraint during domain collapse.");
				}
				
				if (!domain[state]) {
					changed = true;
					break;
				}
			}

			this.grid.setState(idx, CELL_STATE.UNSET);
		}

		return changed;
	}

	private _findLeastEntropy(): { entropy: number, indices: number[] }
	{
		let lowestEntropy = 3;
		const indices: number[] = [];
		for (let idx = 0; idx < this.grid.cellCnt; idx++)
		{
			if(this.grid.getState(idx) !== CELL_STATE.UNSET) continue;
			
			const domain = this.domains[idx];
			const entropy = +domain[0] + +domain[1];

			// If zero, then grid is invalid, discard immediately
			if(entropy === 0) return { entropy, indices: [] };
			if(entropy > lowestEntropy) continue;
			if (entropy < lowestEntropy)
			{
				lowestEntropy = entropy;
				indices.length = 0;
			}
			
			indices.push(idx);
		}

		return { entropy: lowestEntropy, indices };
	}

	private _isValid(): boolean
	{
		for(const constraint of this.allConstraints) {
			switch(constraint.type) {
				case "LINE": {
					const counts = [0, 0],
						half = this.grid.size / 2,
						indices = this.grid.getLineIndicesAt(constraint.lineIdx, constraint.isRow);

					for(const i of indices) {
						const cellState = this.grid.getState(i);
						if(cellState !== CELL_STATE.UNSET && ++counts[cellState] > half) {
							return false;
						}
					}
					
					break; }

				case "ADJACENT": {
					const half = this.grid.size / 2,
						aMasks = this.grid.getLineMasksAt(constraint.aIdx, constraint.isRow),
						bMasks = this.grid.getLineMasksAt(constraint.bIdx, constraint.isRow),
						counts = this.grid.getLineCountsAt(constraint.bIdx, constraint.isRow);

					if(
						(counts[0] === half && (aMasks[0] === bMasks[0])) ||
						(counts[1] === half && (aMasks[1] === bMasks[1]))
					) return false;

					break; }

				case "LIMIT": {
					const limit = constraint.count;
					const sourceState = this.grid.getState(constraint.source);

					const counts = [0, 0, 0];
					for (const i of constraint.counting)
					{
						const state = this.grid.getState(i);
						counts[state]++;
					}

					if(
						sourceState === CELL_STATE.UNSET && 
						counts[CELL_STATE.A] > limit &&
						counts[CELL_STATE.B] > limit
						||
						counts[sourceState] > limit ||
						counts[sourceState] + counts[CELL_STATE.UNSET] < limit
					) {
						return false;
					}

					break; }

				default: throw new Error("Invalid constraint during whole validation.");
			}
		}

		return true;
	}

	private _pushToMapArr(key: number, cons: Constraint)
	{
		let list = this.localConstraints.get(key);
		if (!list)
		{
			list = [];
			this.localConstraints.set(key, list);
		}
		list.push(cons);
	}
}


const presets = (() => {
	function localStorageAvailable() {
	  let storage;
	  try {
		storage = window.localStorage;
		const x = "__storage_test__";
		storage.setItem(x, x);
		storage.removeItem(x);
		return true;
	  } catch (e) {
		return (
		  e instanceof DOMException &&
		  e.name === "QuotaExceededError" &&
		  // acknowledge QuotaExceededError only if there's something already stored
		  storage &&
		  storage.length !== 0
		);
	  }
	}

	let presetMap: Map<string, string>,
		lastUsed = "4";

	const storeKey = "presets",
		lastUsedKey = "last-used",
		storageIsAvailable = localStorageAvailable();

	if(storageIsAvailable) {
		const initPresets = localStorage.getItem(storeKey) ?? "[]";
		const initUsed = localStorage.getItem(lastUsedKey) ?? "4";

		console.log("LOADED PRESETS FROM STORAGE:", initPresets);
		console.log("LOADED LAST PRESET FROM STORAGE:", initUsed);

		presetMap = new Map(JSON.parse(initPresets) as [string, string][]);
		lastUsed = initUsed;
	}
	else presetMap = new Map();

	return {
		getLast(): string {
			return lastUsed;
		},

		setCurrent(preset: string): void {
			lastUsed = preset;
		},

		get(id: string): string | undefined {
			return presetMap.get(id);
		},
		
		set(preset: string, id = Date.now().toString()): string {
			presetMap.set(id, preset);
			return id;
		},
		
		getAll(): MapIterator<[string, string]> {
			return presetMap.entries();
		},

		delete(id: string): void {
			presetMap.delete(id);
		},
		
		save(): void {
			if(!storageIsAvailable) return;
			localStorage.setItem(storeKey, JSON.stringify(Array.from(presetMap.entries())));
			localStorage.setItem(lastUsedKey, lastUsed);
		},
	}
})();

const GetTemplate = (() => {
	const cellTemplate = document.querySelector(".cell-template") as HTMLTemplateElement;
	const presetTemplate = document.querySelector(".preset-template") as HTMLTemplateElement;

	return {
		cell(id: number): DocumentFragment
		{
			const cellFrag = document.importNode(cellTemplate.content, true);
			const cell = cellFrag.querySelector(".cell");
			if (!cell) throw new Error("Cell template does not match expected structure");

			cell.id = `cell-${id}`;

			return cellFrag;
		},

		preset(id: string): DocumentFragment
		{
			const presetFrag = document.importNode(presetTemplate.content, true);

			const preset = presetFrag.querySelector(".presets--preset");
			const err = new Error("Preset template does not match expected structure");
			if (!preset) throw err;
			const useBtn = preset.querySelector("[data-action=USE]");
			if (!useBtn) throw err;

			preset.id = useBtn.textContent = id; 

			return presetFrag;
		}
	}
})()

function updateGridDisplay(
	gridEl: HTMLElement,
	gridData: GridData,
): void
{
	gridEl.style.setProperty("--size", String(gridData.size));

	const cellCnt = gridData.cellCnt;
	if (gridEl.childElementCount > cellCnt)
	{
		const excessCnt = gridEl.childElementCount - cellCnt;
		for(let i = 0; i < excessCnt; i++) {
			const cell = gridEl.children[cellCnt]
			cell.remove();
		}
	}
	else for (let i = gridEl.childElementCount; i < cellCnt; i++)
	{
		const cellFrag = GetTemplate.cell(i);
		gridEl.appendChild(cellFrag);
	}

	for (let i = 0; i < cellCnt; i++)
	{
		const state = gridData.getState(i);
		const cellEl = gridEl.children[i];

		switch (state)
		{
			case CELL_STATE.A:
				cellEl.setAttribute("data-state", "A");
				break;
			case CELL_STATE.B:
				cellEl.setAttribute("data-state", "B");
				break;
			case CELL_STATE.UNSET:
			default:
				cellEl.setAttribute("data-state", "UNSET");
				break;
		}

		const countEl = cellEl.querySelector(".count") as HTMLElement;
		const limit = gridData.getLimitCount(i);
		countEl.textContent = limit < 0 ? "" : String(limit);
	}
}

function addPreset(presetStr: string, presetsListEl: HTMLElement) {
	let msg = "Provide a unique name for the preset.";
	while(true) {
		const id = prompt(msg);

		if(id === null) return;
		if(!id) {
			msg = "Name cannot be empty, try again."
			continue;
		}
		if(presets.get(id)) {
			msg = "Name already exists, try again."
			continue;
		}

		presets.set(presetStr, id);
		presets.setCurrent(presetStr);
		presets.save();
		presetsListEl.appendChild(GetTemplate.preset(id));
		break;
	}
}

function loadPresets(presetsListEl: HTMLElement) {
	const presetFrags: DocumentFragment[] = [];
	for(const [id] of presets.getAll()) {
		presetFrags.push(GetTemplate.preset(id));
	}
	presetsListEl.replaceChildren(...presetFrags);
}

function replacePreset(preset: string, presetEl: HTMLElement): void {
	presets.set(preset, presetEl.id);
	presets.setCurrent(preset);
	presets.save();
}

function deletePreset(presetEl: HTMLElement, presetsListEl: HTMLElement): void {
	presets.delete(presetEl.id);
	presets.save();

	presetEl.remove();
	if(presetsListEl.childElementCount) return;
	presetsListEl.replaceChildren();
}

function main()
{
	let keepSolving = false,
		refreshSolver = false,
		presetStr = presets.getLast();

	let gridData = GridData.fromString(presetStr),
		solver = new Solver(gridData);
	
	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const sizeSel = document.querySelector("#size") as HTMLSelectElement;
	const stepBtn = document.querySelector("#step") as HTMLButtonElement;
	const solveBtn = document.querySelector("#solve") as HTMLButtonElement;
	const resetBtn = document.querySelector("#reset") as HTMLButtonElement;
	const clearBtn = document.querySelector("#clear") as HTMLButtonElement;
	const stateDisplayEl = document.querySelector(".state-display") as HTMLElement;
	const addPresetBtn = document.querySelector("#add-as-preset") as HTMLButtonElement;
	const importStringBtn = document.querySelector("#import-string") as HTMLButtonElement;
	const presetsListEl = document.querySelector(".presets--list") as HTMLUListElement;

	function reset() {
		keepSolving = refreshSolver = false;

		gridData = GridData.fromString(presetStr);
		solver.useGrid(gridData);

		updateGridDisplay(gridEl, gridData);

		presets.setCurrent(presetStr);
		presets.save();
	}
	
	gridEl.addEventListener("click", (e) => {
		if(keepSolving) return;

		const sideEl = e.target;
		if(!(sideEl instanceof HTMLElement)) return;
		const cellEl = sideEl.parentElement;
		if(!(cellEl instanceof HTMLElement && cellEl.classList.contains("cell"))) return;

		const index = +cellEl.id.split("-")[1];
		const isAlreadySet = gridData.getState(index) !== CELL_STATE.UNSET;
		if(isAlreadySet) gridData.setState(index, CELL_STATE.UNSET);
		else {
			const side = sideEl.hasAttribute("data-state-a") ? CELL_STATE.A : CELL_STATE.B;
			gridData.setState(index, side);
		}

		updateGridDisplay(gridEl, gridData);

		presets.setCurrent(gridData.toString());
		presets.save();
		refreshSolver = true;
	})
	
	gridEl.addEventListener("contextmenu", (e) => {
		if(keepSolving) return;

		const sideEl = e.target;
		if(!(sideEl instanceof HTMLElement)) return;
		const cellEl = sideEl.parentElement;
		if(!(cellEl instanceof HTMLElement && cellEl.classList.contains("cell"))) return;

		e.preventDefault();
		
		const index = +cellEl.id.split("-")[1];

		let msg = "Enter the limit count for this cell.";
		while(true) {
			let input = prompt(msg);

			if(!input || input === null || Number.isNaN(+input)) {
				gridData.removeLimit(index);
				break;
			}
			
			const limit = +input;
			try {
				gridData.setLimit(index, limit);
				break;
			}
			catch {
				msg = "Invalid limit for that cell was inputted. Try a smaller or bigger number.";
			}
		}
		
		updateGridDisplay(gridEl, gridData);

		presets.setCurrent(gridData.toString());
		presets.save();
		refreshSolver = true;
	})

	sizeSel.value = gridData.size.toString();
	sizeSel.addEventListener("change", () => {
		const size = +sizeSel.value;
		presetStr = size.toString();
		reset();
	})

	stepBtn.addEventListener("click", () =>
	{
		if(refreshSolver) {
			presetStr = gridData.toString();
			solver.useGrid(gridData);
		}

		if(keepSolving) keepSolving = false;
		else if(!solver.isComplete) {
			solver.step();
			updateGridDisplay(gridEl, gridData);
		}
	})

	solveBtn.addEventListener("click", () => {
		keepSolving = !keepSolving;

		if(keepSolving && refreshSolver) {
			presetStr = gridData.toString();
			solver.useGrid(gridData);
		}
	})

	resetBtn.addEventListener("click", reset);

	clearBtn.addEventListener("click", () => {
		const tmp = presetStr;
		presetStr = gridData.size.toString();
		reset();
		presetStr = tmp;
	})

	addPresetBtn.addEventListener("click", () => {
		addPreset(gridData.toString(), presetsListEl);
	})

	importStringBtn.addEventListener("click", () => {
		let msg = "Enter preset string.";
		while(true) {
			let input = prompt(msg);

			if(input === null) return;
			if(input) {
				addPreset(input, presetsListEl);
				return;
			} 

			msg = "Invalid preset string. Try again.";
		}
	})

	presetsListEl.addEventListener("click", (e) => {
		const btnEl = e.target;
		if(!(btnEl instanceof HTMLElement)) return;
		const presetEl = btnEl.parentElement;
		if(!(presetEl instanceof HTMLElement && presetEl.classList.contains("presets--preset"))) return;

		const action = btnEl.getAttribute("data-action") as "USE" | "REPLACE" | "DELETE";
		
		switch(action) {
			case "USE":
				presetStr = presets.get(presetEl.id)!;
				reset();
				sizeSel.value = gridData.size.toString();
				break;

			case "REPLACE":
				replacePreset(gridData.toString(), presetEl);
				break;

			case "DELETE":
				deletePreset(presetEl, presetsListEl);
				break;
		}
	})

	requestAnimationFrame(function loop() {
		requestAnimationFrame(loop);

		if(keepSolving && !solver.isComplete) {
			solver.step();
			updateGridDisplay(gridEl, gridData);
		}
		else keepSolving = false;

		if(solver.isComplete) {
			stateDisplayEl.setAttribute("data-state", "COMPLETE");
		}
		else {
			stateDisplayEl.setAttribute("data-state", "IN-PROGRESS");
		}
	})

	loadPresets(presetsListEl);
	updateGridDisplay(gridEl, gridData);
	
	// @ts-expect-error
	window.solver = solver;
}

main()