const enum CELL_STATE { A, B, UNSET }

interface LimitNode
{
	limit: number,
	counting: number[];
	countedBy: number[];
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
			if (idx < 0) throw new Error(`Limit index #${idx} is negative.`);
			if (idx >= this.cellCnt) throw new Error(`Limit index #${idx} exceeds ${this.cellCnt - 1}.`);
			if (usedIdx.has(idx)) throw new Error(`Limit at index #${idx} is set more than once.`);
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

			usedIdx.add(idx);

			if (this.limitMap[idx]) {
				this.limitMap[idx].counting = counting;
				this.limitMap[idx].limit = limit;
			}
			else this.limitMap[idx] = {
				limit,
				counting,
				countedBy: [],
			}

			for (const i of counting)
			{
				if (this.limitMap[i]) this.limitMap[i].countedBy.push(idx);
				else this.limitMap[i] = {
					limit: -1,
					counting: [],
					countedBy: [idx],
				}
			}

			this.limits.push(idx);
		}

		console.log(this.limitMap);
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
		let str = "";
		for (let idx = 0; idx < this.cellCnt; idx++)
		{
			if (idx && idx % this.size === 0) str += "\n";
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
		return str;
	}
}

/**
 * NEW PLAN
 * 1. Propagate constraints
 * 2. Locate cells with smallest domains
 * 3. If smallest domain == 0, backtrack to previous state save
 * 4. If smallest domain == 1,
 * 	-		set those cells to those domains
 * 5. Otherwise,
 * 	-		add state save
 * 	-		pick cell to collapse
 * 	-		if all cells already tried, backtrack to previous state save
 * 6. Propagate neighbors
 * 7. Return to step 2
 */

interface CollapsePoint {
	lowest: number[];
	grid: string,
	domain: string,
}

type LocalConstraint = LineConstraint | LimitConstraint;
interface LineConstraint
{
	type: "LINE";
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

type GlobalConstraints = QuadrantConstraint;
interface QuadrantConstraint
{
	// inferred rule, used for domain collapse but not final grid validation
	type: "QUADRANT";
	tl: number[];
	tr: number[];
	bl: number[];
	br: number[];
}

class Solver
{
	public isComplete = false;
	public stopAfterFirstSolution = true;
	public solutions: string[] = [];

	private grid: GridData;
	private collapseStack: CollapsePoint[] = [];
	private domains: Record<CELL_STATE.A | CELL_STATE.B, boolean>[] = [];
	private globalConstraints: GlobalConstraints[] = [];
	private localConstraints = new Map<number, LocalConstraint[]>();

	public useGrid(grid: GridData)
	{
		this.grid = grid;
		this.collapseStack.length = 0;
		this.domains.length = 0;
		this._createGlobalConstraints();
		this._createLocalConstraints();

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

		// console.log(Object.fromEntries(this.allConstraints.entries()));
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

	private _createLocalConstraints(): void
	{
		this.localConstraints.clear();

		const constraintsList: LocalConstraint[] = [];
		const lines = this.grid.lines;
		for (let i = 1; i < this.grid.size; i++)
		{
			constraintsList.push({
				type: "LINE",
				a: lines[i],
				b: lines[i - 1],
			}, {
				type: "LINE",
				a: lines[i + this.grid.size],
				b: lines[i + this.grid.size - 1],
			});
		}

		const limitIndices = this.grid.getLimitedCells();
		for (const idx of limitIndices)
		{
			const limit = this.grid.getLimitCount(idx);
			const neighbors = this.grid.getLimitNeighbors(idx);
			constraintsList.push({
				type: "LIMIT",
				source: idx,
				count: limit,
				counting: neighbors,
			})
		}

		for (const constraint of constraintsList)
		{
			switch(constraint.type) {
				case "LINE":
					for (let i = 0; i < this.grid.size; i++)
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

	private _createGlobalConstraints(): void {
		this.globalConstraints.length = 0;

		for(let x = 0, y, half = this.grid.size / 2; x < half; x++) {
			for(y = 0; y < half; y++) {
				const tl = this._getQuadrant(x       , y       ),
					  tr = this._getQuadrant(x + half, y       ),
					  bl = this._getQuadrant(x       , y + half),
					  br = this._getQuadrant(x + half, y + half);
				
				this.globalConstraints.push({ type: "QUADRANT", tl, tr, bl, br });
			}
		}
	}

	private _getQuadrant(ox: number, oy: number): number[] {
		const quadrant: number[] = [];
		let ix = 0, iy, size = this.grid.size, half = size / 2;
		for(; ix < half; ix++) {
			for(iy = 0; iy < half; iy++) {
				const x = (ix + ox) % size;
				const y = (iy + oy) % size;
				quadrant.push(x + y * size);
			}
		}
		return quadrant;
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
					const containing = constraint.a.includes(idx) ? constraint.a : constraint.b;
					for(const i of containing) affected[i] = true;
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
					case "LINE":{
						const containing = constraint.a.includes(idx) ? constraint.a : constraint.b,
							counts = [0, 0, 0],
							half = this.grid.size / 2;
						for(const i of containing) {
							const state = this.grid.getState(i);
							counts[state]++;
						}
						
						domain[state] = false;
						if(counts[CELL_STATE.A] <= half  && counts[CELL_STATE.B] <= half) {
							for (let i = 0; i < this.grid.size; i++)
							{
								const a = this.grid.getState(constraint.a[i])
								const b = this.grid.getState(constraint.b[i])
								if (a === b && a !== CELL_STATE.UNSET) continue;
								domain[state] = true;
								break;
							}
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
						if (sourceState !== CELL_STATE.B && cntA > limit) domain[state] = false;
						else if (sourceState !== CELL_STATE.A && cntB > limit) domain[state] = false;
						else if (sourceState === CELL_STATE.A && cntU + cntA < limit) domain[state] = false;
						else if (sourceState === CELL_STATE.B && cntU + cntB < limit) domain[state] = false;
						break;}

					default: throw new Error("Invalid local constraint during domain collapse.");
				}
				
				if (!domain[state]) {
					changed = true;
					break;
				}
			}

			if(domain[state]) {
				const quadCounts = new Map<number[], [number, number]>(),
					full = (this.grid.size / 2) ** 2;
				for(const constraint of this.globalConstraints) {
					switch(constraint.type) {
						case "QUADRANT":
							for(const quad of [constraint.tl, constraint.tr, constraint.bl, constraint.br]) {
								const counts = [0, 0, 0];
								for (const i of quad)
								{
									const state = this.grid.getState(i);
									counts[state]++;
								}
								
								quadCounts.set(quad, [counts[CELL_STATE.A], counts[CELL_STATE.B]]);
							}

							const matches: [number[], number[], boolean][] = [
								[constraint.tl, constraint.br, true],
								[constraint.tr, constraint.bl, true],
								[constraint.tl, constraint.tr, false],
								[constraint.bl, constraint.br, false],
								[constraint.tl, constraint.bl, false],
								[constraint.tr, constraint.br, false],
							] 
							for(const [a, b, isDiagonal] of matches) {
								const cntA = quadCounts.get(a)!;
								let cntB = quadCounts.get(b)!;
								const sumA = cntA[0] + cntA[1];
								const sumB = cntB[0] + cntB[1];
								if(!isDiagonal) cntB = [cntB[1], cntB[0]];

								if(sumA === full && sumB === full) {
									if(cntA[0] !== cntB[0]) domain[state] = false;
									else if(cntA[1] !== cntB[1]) domain[state] = false;
								}
								else if(sumA === full) {
									if(cntB[0] > cntA[0]) domain[state] = false;
									else if(cntB[1] > cntA[1]) domain[state] = false;
								}
								else if(sumB === full) {
									if(cntA[0] > cntB[0]) domain[state] = false;
									else if(cntA[1] > cntB[1]) domain[state] = false;
								}

								if(!domain[state]) debugger;
							}

							break;

						default: throw new Error("Invalid global constraint during domain collapse.");
					}

					if (!domain[state]) {
						changed = true;
						break;
					}
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
		for(let idx = 0; idx < this.grid.cellCnt; idx++) {
			const constraints = this.localConstraints.get(idx)!;
			main: for (const constraint of constraints)
			{
				switch(constraint.type) {
					case "LINE": {
						const containing = constraint.a.includes(idx) ? constraint.a : constraint.b,
							counts = [0, 0, 0],
							half = this.grid.size / 2;
						for(const i of containing) {
							const state = this.grid.getState(i);
							counts[state]++;
						}

						if(counts[CELL_STATE.A] > half || counts[CELL_STATE.B] > half) return false;
						
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
						if (sourceState !== CELL_STATE.B && cntA > limit) return false;
						else if (sourceState !== CELL_STATE.A && cntB > limit) return false;
						else if (sourceState === CELL_STATE.A && cntU + cntA < limit) return false;
						else if (sourceState === CELL_STATE.B && cntU + cntB < limit) return false;
						break; }

					default: throw new Error("Invalid constraint during whole validation.");
				}
					

				this.grid.setState(idx, CELL_STATE.UNSET);
			}
		}

		return true;
	}

	private _pushToMapArr(key: number, cons: LocalConstraint)
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

const cellTemplate = document.querySelector(".cell-template") as HTMLTemplateElement;
function createCellFragment(id: number): DocumentFragment
{
	const cellFrag = document.importNode(cellTemplate.content, true);
	const cell = cellFrag.querySelector(".cell");
	if (!cell) throw new Error("Cell template does not match expected structure");

	cell.id = `cell-${id}`;

	return cellFrag;
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

function main()
{
	const presetIdx = 1;
	const presets: [string, [number, number][]][] = [
		[`	_bbb__
			_bab_b
			_bbb__
			______
			______
			______`,
			[],
		],
		[`	aaabbb
			abaabb
			bbaaab
			abbbaa
			babbaa
			bababa`,
			[],
		],
		[`	_____a
			______
			______
			______
			_b____
			______`,
			[
				[3, 4],
				[25, 1],
				[35, 3],
			],
		],
	]

	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const gridData = new GridData(6);

	gridData.parseStringStates(presets[presetIdx][0]);
	gridData.setAllLimits(presets[presetIdx][1]);
	gridData.setAllLimits(gridData.countNeighbors());

	const solver = new Solver();
	solver.useGrid(gridData);

	const stepBtn = document.querySelector("#step") as HTMLButtonElement;
	const solveBtn = document.querySelector("#solve") as HTMLButtonElement;

	let keepSolving = false;
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

	requestAnimationFrame(function loop() {
		requestAnimationFrame(loop);

		if(keepSolving && !solver.isComplete) {
			solver.step();
			updateGridDisplay(gridEl, gridData);

		}
	})

	updateGridDisplay(gridEl, gridData);
}

main()