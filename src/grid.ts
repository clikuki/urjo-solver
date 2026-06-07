const enum CELL_STATE { A, B, UNSET }

interface LimitNode
{
	limit: number,
	counting: number[];
}
class GridData
{
	private _data: CELL_STATE[];
	
	// Columns first, then rows.
	private _lines: number[][];
	// Also column-row, but line is represented by masks of each state
	private _lineBits: Uint8Array;
	// Also column-row, but stores tuples of states
	private _lineCounts: [number, number, number][];

	private _limits = new Map<number, LimitNode>();

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

	public getLimitedCells(): number[]
	{
		return Array.from(this._limits.keys());
	}

	public getLimitCount(idx: number): number
	{
		const node = this._limits.get(idx);
		if (!node) return -1;
		return node.limit;
	}

	public getLimitNeighbors(idx: number): number[]
	{
		const node = this._limits.get(idx);
		if (!node) return [];
		return node.counting;
	}

	public setAllLimits(limitList: [idx: number, limit: number][]): void
	{
		this._limits.clear();

		for (const [idx, limit] of limitList)
		{
			this.setLimit(idx, limit);
		}
	}

	public setLimit(idx: number, limit: number): void {
		if (idx < 0) throw new Error(`Limit index #${idx} is negative.`);
		if (idx >= this.cellCnt) throw new Error(`Limit index #${idx} exceeds ${this.cellCnt - 1}.`);

		if(limit < 0) {
			this._limits.delete(idx);
			return;
		}

		// Find valid neighbors
		const x = idx % this.size;
		const y = Math.floor(idx / this.size);
		const atLeft = x === 0;
		const atRight = x === this.size - 1;
		const atTop = y === 0;
		const atBottom = y === this.size - 1;

		let node = this._limits.get(idx),
			counting: number[];

		if(node) counting = node.counting
		else {
			counting = [];

			if (!atLeft) counting.push(idx - 1);
			if (!atRight) counting.push(idx + 1);
			if (!atTop) counting.push(idx - this.size);
			if (!atBottom) counting.push(idx + this.size);
			if (!(atLeft || atTop)) counting.push(idx - this.size - 1);
			if (!(atRight || atTop)) counting.push(idx - this.size + 1);
			if (!(atLeft || atBottom)) counting.push(idx + this.size - 1);
			if (!(atRight || atBottom)) counting.push(idx + this.size + 1);

			this._limits.set(idx, node = { limit: -1, counting });
		}

		limit = Math.max(limit, 0);
		limit = Math.min(limit, counting.length);
		node.limit = limit;
	}

	public getNeighbors(idx: number): number[] {
		const neighborIndices = [];
		const x = idx % this.size;
		const y = Math.floor(idx / this.size);
		const atLeft = x === 0;
		const atRight = x === this.size - 1;
		const atTop = y === 0;
		const atBottom = y === this.size - 1;

		if (!atLeft) neighborIndices.push(idx - 1);
		if (!atRight) neighborIndices.push(idx + 1);
		if (!atTop) neighborIndices.push(idx - this.size);
		if (!atBottom) neighborIndices.push(idx + this.size);
		if (!(atLeft || atTop)) neighborIndices.push(idx - this.size - 1);
		if (!(atRight || atTop)) neighborIndices.push(idx - this.size + 1);
		if (!(atLeft || atBottom)) neighborIndices.push(idx + this.size - 1);
		if (!(atRight || atBottom)) neighborIndices.push(idx + this.size + 1);

		return neighborIndices;
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
		for(const [idx] of this._limits) {
			const limCnt = this.getLimitCount(idx);
			if(limCnt < 0) continue;
			limStrings.push(`${idx}:${limCnt}`);
		}
		str += "/" + limStrings.join(",");

		return str;
	}
}