type Move = [number, CELL_STATE.A | CELL_STATE.B];

type BSConstraint = BSLineConstraint | BSAdjacencyConstraint | BSLimitConstraint;
interface BSLineConstraint
{
	type: "LINE";
	isRow: boolean;
	lineIdx: number;
}
interface BSAdjacencyConstraint
{
	type: "ADJACENT";
	isRow: boolean;
	aIdx: number;
	bIdx: number;
}
interface BSLimitConstraint
{
	type: "LIMIT";
	source: number;
	count: number;
	counting: number[];
}

interface BSCollapsePoint {
	nextAttempt?: Move;
	grid: string,
	domain: string,
	lastCell: number,
}
class BiStateSolver
{
	public isComplete = false;
	public stopAfterFirstSolution = true;
	public noSort = false;
	public solutions: string[] = [];

	private grid: GridData;
	private collapseStack: BSCollapsePoint[] = [];
	private domains: Record<CELL_STATE.A | CELL_STATE.B, boolean>[] = [];
	private limitedCells: number[];
	private allConstraints: BSConstraint[] = [];
	private localConstraints = new Map<number, BSConstraint[]>();
	// private noGoods: number[][] = []; // serial list; idx_1, state_1, ..., idx_n, state_n

	constructor(grid?: GridData) {
		if(grid) this.useGrid(grid);
	}

	public useGrid(grid: GridData)
	{
		this.grid = grid;
		this.collapseStack.length = 0;
		this.domains.length = 0;
		this.limitedCells = this.grid.getLimitedCells();
		this.isComplete = false;
		this.solutions.length = 0;
		// this.noGoods.length = 0;
		this._createConstraints();

		const emptyIndices: number[] = [];
		for(let idx = 0; idx < grid.cellCnt; idx++) {
			const state = grid.getState(idx);
			this.domains[idx] = {
				[CELL_STATE.A]: state !== CELL_STATE.B,
				[CELL_STATE.B]: state !== CELL_STATE.A,
			};
			
			if (state === CELL_STATE.UNSET) emptyIndices.push(idx);
		}

		for (const idx of emptyIndices)
		{
			this._updateDomain(idx, false);
		}
	}

	public step(): void
	{
		if(this.isComplete) return;

		// let hasInvalidCombos = this._matchesNoGood();
		// if(hasInvalidCombos) {
		// 	let combination = this._createCombination();

		// 	while(hasInvalidCombos) {
		// 		combination.length = this.collapseStack.length * 2 - 2;
		// 		this._revertToValidCollapseNode();
		// 		hasInvalidCombos = this._matchesNoGood();
		// 	}
			
		// 	this.noGoods.push(combination!);
		// }

		const { entropy, moves } = this._findMoves();
		// console.log(entropy, moves);

		if (entropy === 1)
		{
			for (const [idx, state] of moves)
			{
				this.grid.setState(idx, state);
				this.domains[idx][state === CELL_STATE.A ? CELL_STATE.B : CELL_STATE.A] = false;
			}

			this._updateSurroundingDomain(moves.map(([i]) => i));
		}
		else if(entropy === 2)
		{
			// Create new collapse point, then try cell
			const orderedIndices = this._orderMoves(moves);
			const [idx, state] = orderedIndices.pop()!;
			const nextMoveAttempt = orderedIndices.pop()!;

			this.collapseStack.push({
				nextAttempt: nextMoveAttempt[0] !== idx ? undefined : nextMoveAttempt,
				grid: this.grid.toString(),
				domain: JSON.stringify(this.domains),
				lastCell: idx,
			});

			this.grid.setState(idx, state);
			this.domains[idx][state === CELL_STATE.A ? CELL_STATE.B : CELL_STATE.A] = false;
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

			// const last = this.collapseStack.at(-1)!.lastCell;
			// console.log(last, this.grid.getState(last));

			// const combo = this._createCombination();
			// this.noGoods.push(combo);
			this._revertToValidCollapseNode();
		}
	}

	// private _createCombination(): number[] {
	// 	const noGood = [];
	// 	for(const { lastCell } of this.collapseStack) {
	// 		noGood.push(lastCell, this.grid.getState(lastCell))
	// 	}
	// 	return noGood;
	// }

	private _revertToValidCollapseNode(): void {
		let collapsed: BSCollapsePoint | undefined;
		while(!collapsed) {
			collapsed = this.collapseStack.at(-1);
			if(!collapsed) {
				this.isComplete = true;
				return;
			}

			const move = collapsed.nextAttempt;
			if(move) {
				const [idx, state] = move;
				collapsed.nextAttempt = undefined;
				
				this.grid.parseStringStates(collapsed.grid);
				this.domains = JSON.parse(collapsed.domain);
				this.grid.setState(idx, state);
				this.domains[idx][state === CELL_STATE.A ? CELL_STATE.B : CELL_STATE.A] = false;
				this._updateSurroundingDomain([idx]);
			}
			else {
				collapsed = undefined;
				this.collapseStack.pop();
			}
		}
	}

	private _orderMoves(moves: Move[]): Move[] {
		if(this.noSort) return moves.reverse();

		const indexMoveMap = moves.reduce((m, mv) => {
			const idx = mv[0];
			if(m.has(idx)) m.get(idx)!.push(mv);
			else m.set(idx, [mv]);
			return m;
		}, new Map<number, Move[]>());
		
		const neighborhoodLimitCounts: number[] = [];
		for(const [idx] of indexMoveMap) {
			let limCnt = this.localConstraints.get(idx)!.length;

			for(const neighborIdx of this.grid.getNeighbors(idx)) {
				if(this.limitedCells.includes(neighborIdx)) limCnt++;
			}

			neighborhoodLimitCounts[idx] = limCnt;
		}

		const sources: number[] = [];
		const limitedBySet: number[] = [];
		const limitedByUnset: number[] = [];
		const nonsources: number[] = [];

		main: for(const [idx] of indexMoveMap) {
			const constraints = this.localConstraints.get(idx)!;
			for(const constraint of constraints) {
				if(constraint.type !== "LIMIT") continue;
				if(constraint.source === idx) sources.push(idx);
				else if(this.grid.getState(constraint.source) === CELL_STATE.UNSET) limitedByUnset.push(idx);
				else limitedBySet.push(idx);
				continue main;
			}
			nonsources.push(idx);
		}

		for(const cells of [sources, limitedBySet, limitedByUnset, nonsources]) {
			cells.sort((a, b) => neighborhoodLimitCounts[a] - neighborhoodLimitCounts[b]);
		}

		return nonsources.concat(limitedByUnset, sources, limitedBySet).flatMap(idx => indexMoveMap.get(idx)!);
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

		for (const idx of this.limitedCells)
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
						pushToMapArr(idx, constraint, this.localConstraints);
					}
					break;

				case "ADJACENT":
					const aIndices = this.grid.getLineIndicesAt(constraint.aIdx, constraint.isRow);
					const bIndices = this.grid.getLineIndicesAt(constraint.bIdx, constraint.isRow);
					for (let i = 0; i < size; i++)
					{
						pushToMapArr(aIndices[i], constraint, this.localConstraints);
						pushToMapArr(bIndices[i], constraint, this.localConstraints);
					}
					break;

				case "LIMIT":
					pushToMapArr(constraint.source, constraint, this.localConstraints);
					for (const idx of constraint.counting)
					{
						pushToMapArr(idx, constraint, this.localConstraints);
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
				// if(!affected[i] || this.grid.getState(i) !== CELL_STATE.UNSET) continue;
				if(!affected[i]) continue;
				const isSet = this.grid.getState(i) !== CELL_STATE.UNSET;

				if(this._updateDomain(i, isSet)) {
				// if(this._updateDomain(i, false)) {
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

	private _updateDomain(idx: number, isSet: boolean): boolean
	{
		// if(isSet) debugger;
		const domain = this.domains[idx];
		const constraints = this.localConstraints.get(idx)!;
		let changed = false;
		for (const state of [CELL_STATE.A, CELL_STATE.B] as const)
		{
			if (!domain[state]) continue;

			if(!isSet) this.grid.setState(idx, state);

			for (const constraint of constraints)
			{
				switch(constraint.type) {
					case "LINE": {
						if(isSet) continue;

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
						if(isSet) continue;
						
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
							if(state !== CELL_STATE.UNSET) counts[state]++;
							else {
								const ndom = this.domains[i];
								if(!ndom[CELL_STATE.A]) counts[CELL_STATE.B]++;
								else if(!ndom[CELL_STATE.B]) counts[CELL_STATE.A]++;
								else counts[CELL_STATE.UNSET]++;
							}
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

			// if(!this._isValid()) {
			// 	domain[state] = false;
			// 	changed = true;
			// }

			if(!isSet) this.grid.setState(idx, CELL_STATE.UNSET);
		}

		return changed;
	}

	// private _matchesNoGood(): boolean {
	// 	noGoodChecks: for(let i = this.noGoods.length - 1, noGood; i >= 0; i--) {
	// 		noGood = this.noGoods[i];
	// 		for(let j = 1, idx, state; j < noGood.length; j += 2) {
	// 			idx = noGood[j-1];
	// 			state = noGood[j];
	// 			if(this.grid.getState(idx) !== state) continue noGoodChecks;
	// 		}

	// 		console.log("FAILED")
	// 		return true;
	// 	}

	// 	return false;
	// }

	private _findMoves(): { entropy: number, moves: Move[] }
	{
		let lowestEntropy = 3;
		const moves: Move[] = [];
		for (let idx = 0; idx < this.grid.cellCnt; idx++)
		{
			if(this.grid.getState(idx) !== CELL_STATE.UNSET) continue;
			
			const domain = this.domains[idx];
			const entropy = +domain[0] + +domain[1];

			// If zero, then grid is invalid, discard immediately
			if(entropy === 0) return { entropy, moves };
			if(entropy > lowestEntropy) continue;
			if (entropy < lowestEntropy)
			{
				lowestEntropy = entropy;
				moves.length = 0;
			}
			
			if(domain[CELL_STATE.A]) moves.push([idx, CELL_STATE.A]);
			if(domain[CELL_STATE.B]) moves.push([idx, CELL_STATE.B]);
		}

		return { entropy: lowestEntropy, moves };
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
						sourceState !== CELL_STATE.UNSET && (
							counts[sourceState] > limit ||
							counts[sourceState] + counts[CELL_STATE.UNSET] < limit)
					) {
						return false;
					}

					break; }

				default: throw new Error("Invalid constraint during whole validation.");
			}
		}

		return true;
	}
}

interface CellNode {
	next: CellNode | null;
	index: number;
}
const enum GROUP_STATE { A = 0, B = 1, NORMAL = 2 };

type GCConstraint = GCLineConstraint | GCAdjacencyConstraint | GCNeighborConstraint;
interface GCLineConstraint
{
	type: "LINE";
	indices: number[];
}
interface GCAdjacencyConstraint
{
	type: "ADJACENT";
	a: number[];
	b: number[];
}
interface GCNeighborConstraint
{
	type: "NEIGHBOR";
	count: number;
	source: number;
	counting: number[];
}

interface GroupCollapsePoint {
    // TODO
}
class GroupSolver {
	public isComplete = false;
	public solutions: string[] = [];
    
	private grid: GridData;
	private limitedCells: number[];
	private collapseStack: GroupCollapsePoint[] = [];

	private nodes: CellNode[];
	private allConstraints: GCConstraint[] = [];
	private localConstraints = new Map<number, GCConstraint[]>();
	private nonMatch: boolean[][] = [];
    
	constructor(grid?: GridData) {
		if(grid) this.useGrid(grid);
	}

	public useGrid(grid: GridData)
	{
		this.grid = grid;
		this.collapseStack.length = 0;
		this.limitedCells = this.grid.getLimitedCells();
		this.solutions.length = 0;
		// this.nodes = Array(grid.cellCnt).fill(0).map((_, i) => ({ next: null, id: -1, index: i }));
		this.nodes = Array(grid.cellCnt).fill(0).map((_, i) => ({ next: null, index: i }));
		this.nonMatch = Array(grid.cellCnt).fill(0).map(() => []);
		this.isComplete = false;
        
		this.createConstraints();
		this.mergeByState(CELL_STATE.A)
		this.mergeByState(CELL_STATE.B)

		// let id = 0;
		// const idxA = this.mergeByState(CELL_STATE.A);
		// if(idxA >= 0) this.nodes[idxA].id = id++;
		// const idxB = this.mergeByState(CELL_STATE.B);
		// if(idxB >= 0) this.nodes[idxB].id = id++;
		// if(id === 2) this.addAsUnmatch(idxA, idxB);

		// for(let idx = 0; idx < this.grid.cellCnt; idx++) {
		// 	const node = this.nodes[idx];
		// 	if(!node.next && node.id < 0) node.id = id++
		// }
	}

    public step(): void {
        this.applyConstraints();
    }

	private createConstraints(): void
	{
		this.allConstraints.length = 0;

		const size = this.grid.size;
		const rows = Array(size).fill(0).map((_, i) => Array(size).fill(0).map((_, j) => j + i * size));
		const cols = rows.map((line, i) => line.map((_, j) => i + j * size));

		for (let i = 0; i < size; i++) {
			this.allConstraints.push({
				type: "LINE",
				indices: rows[i],
			}, {
				type: "LINE",
				indices: cols[i],
			});
		}

		for (let i = 1; i < size; i++)
		{
			this.allConstraints.push({
				type: "ADJACENT",
				a: rows[i - 1],
				b: rows[i],
			}, {
				type: "ADJACENT",
				a: cols[i - 1],
				b: cols[i],
			});
		}

		for (const idx of this.limitedCells)
		{
			const limit = this.grid.getLimitCount(idx);
			const neighbors = this.grid.getLimitNeighbors(idx);
			this.allConstraints.push({
				type: "NEIGHBOR",
				source: idx,
				count: limit,
				counting: neighbors,
			})
		}

		for(const constraint of this.allConstraints) {
			switch(constraint.type) {
				case "LINE":
					for(const idx of constraint.indices) pushToMapArr(idx, constraint, this.localConstraints);
					break;

				case "ADJACENT":
					for(const idx of constraint.a) pushToMapArr(idx, constraint, this.localConstraints);
					for(const idx of constraint.b) pushToMapArr(idx, constraint, this.localConstraints);
					break;

				case "NEIGHBOR":
					pushToMapArr(constraint.source, constraint, this.localConstraints);
					for(const idx of constraint.counting) pushToMapArr(idx, constraint, this.localConstraints);
					break;
			}
		}
	}

	private applyConstraints(): boolean
	{
		const updated: boolean[] = [];
		for(const constraint of this.allConstraints) {
			const isValid = this.applyConstraint(constraint, updated);
			if(!isValid) return false;
		}
		
		let iters = 1000;
		while(updated[-1] && iters-- > 0) {
			updated[-1] = false;

			for(let idx = 0; idx < updated.length; idx++) {
				if(!updated[idx]) continue;
				updated[idx] = false;
				
				for(const con of this.localConstraints.get(idx)!) {
					// if(con.type === "ADJACENT" && con.a[0] === 2 && con.b[0] === 3) debugger;
					const isValid = this.applyConstraint(con, updated);
					if(this.getRoot(2) === this.getRoot(3)) debugger;
					if(!isValid) return false;
				}
			}
		}

		if(iters <= 0) throw new Error("Could not constrain in reasonable time.")

		if(!this.differingGroupMerge()) return false;

		return true;
	}

	private differingGroupMerge(): boolean {
		const groupDiffs = new Map<CellNode, CellNode[]>();
		let attemptMerge = true;
		while(attemptMerge)
		{
			attemptMerge = false;
			for(let i = 0, j; i < this.grid.cellCnt; i++)
			{
				for(j = 0; j < this.grid.cellCnt; j++)
				{
					if(!this.nonMatch[i][j]) continue;
					const a = this.getRoot(i),
						b = this.getRoot(j),
						entry = groupDiffs.get(a);

					if(a === b) return false;

					if(entry)
					{
						entry.push(b);
						this.nonMatch[i][j] = false;
						this.nonMatch[j][i] = false;
					}
					else groupDiffs.set(a, [b]);
				}	
			}
			
			for(const [, roots] of groupDiffs)
			{
				if(roots.length < 2) continue;
				this.mergeGroups(roots.map(r => r.index));
				attemptMerge = true;
			}
			
			groupDiffs.clear();
		}

		return true;
	}

	private applyConstraint(con: GCConstraint, updated: boolean[]): boolean
	{
		const size = this.grid.size;
		switch(con.type) {
			case "LINE":{
				const counts = new Map<CellNode, number>();
				const maxCnt = size / 2;
				const roots = con.indices.map(c => this.getRoot(c));

				const uniqueRoots = new Set(roots);
				if(uniqueRoots.size === 2) break;

				for(let i = 0; i < size; i++) {
					const root = roots[i];
					const count = (counts.get(root) ?? 0) + 1;
					if(count > maxCnt) return false;
					uniqueRoots.add(root);
					counts.set(root, count);
				}

				for(let i = 0; i < size; i++) {
					const root = roots[i];
					const count = counts.get(root)!;

					if(count === maxCnt) {
						const combine: number[] = [];
						for(let j = 0; j < size; j++) {
							if(roots[j] === root) continue;
							const idx = con.indices[j];
							combine.push(idx);
							updated[idx] = true;
						}
						
						this.mergeGroups(combine);
						this.addAsUnmatch(combine[0], con.indices[i]);
						updated[-1] = true;
					}
				}

				break;}

			case "ADJACENT":{
				const rootsA = con.a.map((i) => (this.getRoot(i))),
					  rootsB = con.b.map((i) => (this.getRoot(i))),
					  uniqueRootsA = new Set<CellNode>(),
					  uniqueRootsB = new Set<CellNode>();

				let matchCount = 0;
				for(let i = 0, a: CellNode, b: CellNode; i < size; i++)
				{
					a = rootsA[i];
					b = rootsB[i];
					if(a === b) matchCount++;
					uniqueRootsA.add(a);
					uniqueRootsB.add(b);
				}

				if(matchCount >= size - 1) return false; // n-1 match case
				else if(matchCount === size - 2)
				{
					// opposite non-match case
					let changed = false;
					for(let i = 0; i < size; i++)
					{
						const a = con.a[i], b = con.b[i];
						if(rootsA[i] === rootsB[i] || this.nonMatch[a][b]) continue;
						this.addAsUnmatch(a, b);
						changed = true;
					}
					
					if(changed) updated[-1] = true;
				}
				else if(
					matchCount === 0 &&
					uniqueRootsA.size === 2 &&
					uniqueRootsB.size === 2 &&
					!Array.from(uniqueRootsA).every(r => uniqueRootsB.has(r)) // ignore if already set
				)
				{
					// same pattern different group case
					const [comparisonRoot] = rootsA.values();
					let aMatched = false, bMatched = false;
					for(let i = 0; i < size; i++)
					{
						if(!aMatched && rootsA[i] === comparisonRoot) {
							aMatched = true;
							this.mergeGroups([con.a[i], con.b[i]]);
						}
						else if(!bMatched && rootsA[i] !== comparisonRoot) {
							bMatched = true;
							this.mergeGroups([con.a[i], con.b[i]]);
						}

						if(aMatched && bMatched) break;
					}
					
					updated[-1] = true;
				}

				break;}

			case "NEIGHBOR":{
				const limit = con.count;
				const sourceRoot = this.getRoot(con.source);
				const roots = con.counting.map(i => this.getRoot(i));
				const uniqueRoots = new Set(roots);
				const hasRoot = uniqueRoots.has(sourceRoot);
				const max = con.counting.length;

				// debugger;

				if(!limit)
				{
					if(hasRoot) return false;
					if(uniqueRoots.size === 1) break;
					this.mergeGroups(con.counting);
				}
				else if(limit === max)
				{
					if(hasRoot && uniqueRoots.size === 1) break;
					this.mergeGroups(con.counting.concat(con.source));
				}

				if(!limit || limit === max)
				{
					updated[-1] = true;
					for(const idx of con.counting)
					{
						updated[idx] = true;
					}
				}

				break;}

			default: throw new Error("Invalid local constraint during constraint application.");
		}

		return true;
	}

	// private getLineMaskAndCount(line: number[]): Map<CellNode, { mask: number, count: number }>
	// {
	// 	const nodeData = new Map<CellNode, { mask: number, count: number }>(),
	// 		size = this.grid.size;
	// 	for(let i = 0; i < size; i++) {
	// 		const root = this.getRoot(line[i]);
	// 		const data = nodeData.get(root);
	// 		if(data) {
	// 			data.mask |= 1 << i;
	// 			data.count++;
	// 		}
	// 		else {
	// 			nodeData.set(root, {
	// 				mask: 1 << i,
	// 				count: 1,
	// 			})
	// 		}
	// 	}
	// 	return nodeData;
	// }

	private mergeGroups(indices: number[]): void
	{
		const roots = new Set<CellNode>;
		let primaryRoot: CellNode | null = null, idx, root;
		for(idx of indices) {
			root = this.getRoot(idx);
			roots.add(root);
			if(!primaryRoot || primaryRoot.index > root.index) primaryRoot = root;
		}

		if(roots.size < 2) return;
		for(root of roots) {
			if(root === primaryRoot) continue;
			root.next = primaryRoot;
		}
	}

	private mergeByState(batchState: CELL_STATE): number
	{
		let rootIdx = -1, prevCell, currCell, i = 0;
		for(; i < this.grid.cellCnt; i++) {
			const state = this.grid.getState(i);
			if(state !== batchState) continue;

			currCell = this.nodes[i];
			if(prevCell) currCell.next = prevCell;
			else rootIdx = i;
			prevCell = currCell;
		}

		return rootIdx;
	}

	private getRoot(c: CellNode | number): CellNode
	{
		if(typeof c === "number") c = this.nodes[c];
		while(c.next) {
			c = c.next;
		}
		return c;
	}

	private addAsUnmatch(a: number, b: number) {
		a = this.getRoot(a).index;
		b = this.getRoot(b).index;
		this.nonMatch[a][b] = true;
		this.nonMatch[b][a] = true;
	}

    private logGroupIDs(): void
	{
        const layers: number[][] = [[]];
        for(let idx = 0; idx < this.grid.cellCnt; idx++) {
            if(idx !== 0 && idx % this.grid.size === 0) layers.push([]);
            layers[layers.length - 1].push(this.getRoot(idx).index);
        }
        console.table(layers);
    }
}

function pushToMapArr<T>(key: number, cons: T, localCons: Map<number, T[]>)
{
    let list = localCons.get(key);
    if (!list)
    {
        list = [];
        localCons.set(key, list);
    }
    list.push(cons);
}