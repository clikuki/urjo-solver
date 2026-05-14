const enum CELL_STATE { A, B, UNSET }

interface LimitNode
{
	limit: number,
	counting: number[];
}
type LimitEntry = [number, number[]];

class GridData
{
	private data: CELL_STATE[];
	private _lines: number[][];
	private filledCount = 0;
	private limits: number[] = [];
	private limitMap: LimitNode[] = [];

	public get lines(): readonly CELL_STATE[][]
	{
		return this._lines;
	}

	public get isFilled(): boolean
	{
		return this.filledCount === this.cellCnt;
	}

	public readonly cellCnt: number;
	constructor(public readonly size: number)
	{
		if (size < 4 || size % 2) throw new Error("Grid size must be even");

		this.cellCnt = size * size;
		this.data = Array(this.cellCnt).fill(0).map(_ => CELL_STATE.UNSET);
		this._lines = Array(this.size) // Indices per line
			.fill(0)
			.map((_, x) => Array(size).fill(0).map((_, y) => x + y * size))
			.concat(
				Array(this.size)
					.fill(0)
					.map((_, y) => Array(size).fill(0).map((_, x) => x + y * size))
			);
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
		return this.data[idx];
	}

	public setState(idx: number, state: CELL_STATE): void
	{
		if (this.data[idx] === state) return;
		this.data[idx] = state;
	}

	public getLimitedCells(): readonly number[]
	{
		return this.limits;
	}

	public getLimitCount(idx: number): number
	{
		const node = this.limitMap[idx];
		if (!node) return -1;
		return node.limit;
	}

	public getLimitNeighbors(idx: number): number[]
	{
		const node = this.limitMap[idx];
		if (!node) return [];
		return node.counting;
	}

	public setAllLimits(limitList: [idx: number, limit: number][]): void
	{
		this.limitMap.length = 0;
		this.limits.length = 0;

		const usedIdx = new Set<number>();
		for (const [idx, limit] of limitList)
		{
			this.setLimit(idx, limit, usedIdx);
		}
	}

	public setLimit(idx: number, limit: number, usedIdx?: Set<number>): void {
		if (idx < 0) throw new Error(`Limit index #${idx} is negative.`);
		if (idx >= this.cellCnt) throw new Error(`Limit index #${idx} exceeds ${this.cellCnt - 1}.`);
		if (usedIdx?.has(idx)) throw new Error(`Limit at index #${idx} is set more than once.`);
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

		usedIdx?.add(idx);

		this.limitMap[idx] = {
			limit,
			counting,
		}

		this.limits.push(idx);
	}

	public removeLimit(idx: number): void {
		if(!this.limitMap[idx]) return;

		this.limitMap[idx].counting.length = 0;
		this.limitMap[idx].limit = -1;
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
		for(const idx of this.limits) {
			limStrings.push(`${idx}:${this.getLimitCount(idx)}`);
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
	line: number[];
}
interface AdjacencyConstraint
{
	type: "ADJACENT";
	a: number[];
	b: number[];
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

	private grid: GridData;
	private collapseStack: CollapsePoint[] = [];
	private domains: Record<CELL_STATE.A | CELL_STATE.B, boolean>[] = [];
	private allConstraints: Constraint[] = [];
	private localConstraints = new Map<number, Constraint[]>();

	public useGrid(grid: GridData)
	{
		this.grid = grid;
		this.collapseStack.length = 0;
		this.domains.length = 0;
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

		const lines = this.grid.lines, size = this.grid.size;
		for (let i = 0; i < size; i++) {
			this.allConstraints.push({
				type: "LINE",
				line: lines[i],
			}, {
				type: "LINE",
				line: lines[i + size],
			})
		}

		for (let i = 1; i < size; i++)
		{
			this.allConstraints.push({
				type: "ADJACENT",
				a: lines[i],
				b: lines[i - 1],
			}, {
				type: "ADJACENT",
				a: lines[i + size],
				b: lines[i + size - 1],
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
					for (const idx of constraint.line)
					{
						this._pushToMapArr(idx, constraint);
					}
					break;

				case "ADJACENT":
					for (let i = 0; i < size; i++)
					{
						this._pushToMapArr(constraint.a[i], constraint);
						this._pushToMapArr(constraint.b[i], constraint);
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
		
		// if(indices[0] === 33) {
		// 	const initUpdate = [];
		// 	for(let i = 0; i < this.grid.cellCnt; i++) {
		// 		if(!affected[i] || this.grid.getState(i) !== CELL_STATE.UNSET) continue;
		// 		initUpdate.push(i);
		// 	}
		// 	console.log(...initUpdate);
		// }

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
					for(const i of constraint.line) affected[i] = true;
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
			if (!domain[state]) break;

			this.grid.setState(idx, state);

			for (const constraint of constraints)
			{
				switch(constraint.type) {
					case "LINE": {
						const counts = [0, 0],
							half = this.grid.size / 2;
						for(const i of constraint.line) {
							const cellState = this.grid.getState(i);
							if(cellState !== CELL_STATE.UNSET && ++counts[cellState] > half) {
								domain[state] = false;
								break;
							}
						}
						break;}

					case "ADJACENT":{
						domain[state] = false;
						for (let i = 0; i < this.grid.size; i++)
						{
							const a = this.grid.getState(constraint.a[i])
							const b = this.grid.getState(constraint.b[i])
							if (a === b && a !== CELL_STATE.UNSET) continue;
							domain[state] = true;
							break;
						}
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

						const cntA = counts[CELL_STATE.A],
							  cntB = counts[CELL_STATE.B],
							  cntU = counts[CELL_STATE.UNSET];
						// if(idx === 4) debugger;

						if (sourceState === CELL_STATE.A && cntU + cntA < limit) domain[state] = false;
						else if (sourceState === CELL_STATE.B && cntU + cntB < limit) domain[state] = false;
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
		const lowestCells: number[] = [];
		for (let idx = 0; idx < this.grid.cellCnt; idx++)
		{
			if(this.grid.getState(idx) !== CELL_STATE.UNSET) continue;
			
			const domain = this.domains[idx];
			const entropy = +domain[0] + +domain[1];

			if (entropy < lowestEntropy)
			{
				lowestEntropy = entropy;
				if (entropy === 0) break; // If zero, then state is invalid, discard immediately

				lowestCells.length = 0;
				lowestCells[0] = idx;
			}
			else if (entropy === lowestEntropy)
			{
				lowestCells.push(idx);
			}
		}

		return { entropy: lowestEntropy, indices: lowestCells };
	}

	private _isValid(): boolean
	{
		if(this.grid.toString() === "bbab\nbaba\naabb\nbbaa") debugger;

		main: for(const constraint of this.allConstraints) {
			switch(constraint.type) {
				case "LINE": {
					const counts = [0, 0],
						half = this.grid.size / 2;
					for(const i of constraint.line) {
						const cellState = this.grid.getState(i);
						if(cellState !== CELL_STATE.UNSET && ++counts[cellState] > half) {
							return false;
						}
					}
					break; }

				case "ADJACENT": {
					for (let i = 0; i < this.grid.size; i++)
					{
						const a = this.grid.getState(constraint.a[i])
						const b = this.grid.getState(constraint.b[i])
						if (a === b && a !== CELL_STATE.UNSET) continue;
						continue main;
					}
					return false; }

				case "LIMIT": {
					const limit = constraint.count;
					const sourceState = this.grid.getState(constraint.source);

					const counts = [0, 0, 0];
					for (const i of constraint.counting)
					{
						const state = this.grid.getState(i);
						counts[state]++;
					}

					const cntA = counts[CELL_STATE.A],
						cntB = counts[CELL_STATE.B],
						cntU = counts[CELL_STATE.UNSET];

					if (sourceState === CELL_STATE.A && cntU + cntA < limit) return false;
					else if (sourceState === CELL_STATE.B && cntU + cntB < limit) return false;
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

const presets = (() => {
	let presetMap: Map<string, string>;
	const key = "presets";
	const storageIsAvailable = localStorageAvailable();

	if(storageIsAvailable) {
		const initPresets = localStorage.getItem(key) ?? "[]";
		console.log("LOADED PRESETS FROM STORAGE:", initPresets);
		presetMap = new Map(JSON.parse(initPresets) as [string, string][]);
	}
	else presetMap = new Map();

	return {
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
			localStorage.setItem(key, JSON.stringify(Array.from(presetMap.entries())));
		},
	}
})();

const cellTemplate = document.querySelector(".cell-template") as HTMLTemplateElement;
function createCellFragment(id: number): DocumentFragment
{
	const cellFrag = document.importNode(cellTemplate.content, true);
	const cell = cellFrag.querySelector(".cell");
	if (!cell) throw new Error("Cell template does not match expected structure");

	cell.id = `cell-${id}`;

	return cellFrag;
}

const presetTemplate = document.querySelector(".preset-template") as HTMLTemplateElement;
function createPresetFragment(id: string): DocumentFragment
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

function updateGridDisplay(
	gridEl: HTMLElement,
	data: GridData,
): void
{
	gridEl.style.setProperty("--size", String(data.size));

	if (gridEl.childElementCount > data.cellCnt)
	{
		const excessCells = gridEl.querySelectorAll(`:nth-child(n + ${data.cellCnt + 1})`)
		excessCells.forEach(c => c.remove());
	}
	else for (let i = gridEl.childElementCount; i < data.cellCnt; i++)
	{
		const cellFrag = createCellFragment(i);
		gridEl.appendChild(cellFrag);
	}

	for (let i = 0; i < data.cellCnt; i++)
	{
		const state = data.getState(i);
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
		const limit = data.getLimitCount(i);
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
		presets.save();
		presetsListEl.appendChild(createPresetFragment(id));
		break;
	}
}

function loadPresets(presetsListEl: HTMLElement) {
	for(const [id] of presets.getAll()) {
		presetsListEl.appendChild(createPresetFragment(id));
	}
}

function replacePreset(gridData: GridData, presetEl: HTMLElement): void {
	const newPreset = gridData.toString();
	presets.set(newPreset, presetEl.id);
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
	let gridData = new GridData(4);
	let solver = new Solver();

	const defaultPresetFrag = "/________________/";
	let keepSolving = false;
	let presetStr = "4" + defaultPresetFrag;

	solver.useGrid(gridData);
	
	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const sizeSel = document.querySelector("#size") as HTMLSelectElement;
	const stepBtn = document.querySelector("#step") as HTMLButtonElement;
	const solveBtn = document.querySelector("#solve") as HTMLButtonElement;
	const resetBtn = document.querySelector("#reset") as HTMLButtonElement;
	const clearBtn = document.querySelector("#clear") as HTMLButtonElement;
	const addPresetBtn = document.querySelector("#add-as-preset") as HTMLButtonElement;
	const importStringBtn = document.querySelector("#import-string") as HTMLButtonElement;
	const presetsListEl = document.querySelector(".presets--list") as HTMLUListElement;

	function reset() {
		gridData = GridData.fromString(presetStr);
		solver.useGrid(gridData);
		updateGridDisplay(gridEl, gridData);
	}
	
	gridEl.addEventListener("click", (e) => {
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
	})
	
	gridEl.addEventListener("contextmenu", (e) => {
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
				updateGridDisplay(gridEl, gridData);
				return;
			}

			
			const limit = +input;
			
			try {
				gridData.setLimit(index, limit);
				updateGridDisplay(gridEl, gridData);
				return;
			}
			catch {
				msg = "Invalid limit for that cell was inputted. Try a smaller or bigger number.";
			}
		}
	})

	sizeSel.addEventListener("change", () => {
		const size = +sizeSel.value;
		presetStr = `${size}${defaultPresetFrag}`;
		reset();
	})

	stepBtn.addEventListener("click", () =>
	{
		if(keepSolving) keepSolving = false;
		else if(!solver.isComplete) {
			solver.step();
			updateGridDisplay(gridEl, gridData);
		}
	})

	solveBtn.addEventListener("click", () => {
		keepSolving = !keepSolving;
	})

	resetBtn.addEventListener("click", reset);

	clearBtn.addEventListener("click", () => {
		const tmp = presetStr;
		presetStr = `${gridData.size}${defaultPresetFrag}`;
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
				replacePreset(gridData, presetEl);
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
	})

	loadPresets(presetsListEl);
	updateGridDisplay(gridEl, gridData);
}

main()