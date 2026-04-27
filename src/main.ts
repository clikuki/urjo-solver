const enum CELL_STATE { A, B, UNSET }

interface LimitNode
{
	counting: number[];
	countedBy: number[];
}
type LimitEntry = [number, number[]];
type Integer = number | BigInt;

abstract class GridData
{
	public abstract size: number;
	public abstract cellCnt: number;
	public abstract getState(idx: number): CELL_STATE;
	public abstract setState(idx: number, state: CELL_STATE): void;
	public abstract getLines(): [Integer, Integer][]

	private limitMap: LimitNode[] = [];
	public getLimit(idx: number): number
	{
		const node = this.limitMap[idx];
		if (!node) return -1;

		return node.counting.length;
	}

	public getSurroundingLimits(idx: number): LimitEntry[]
	{
		const node = this.limitMap[idx];
		if (!node) return [];

		const limitSet: LimitEntry[] = node.countedBy.map(idx => [idx, this.limitMap[idx].counting]);
		if (node.counting.length) limitSet.push([idx, node.counting]);
		return limitSet;
	}

	public setAllLimits(limitList: [idx: number, limit: number][]): void
	{
		this.limitMap.length = 0;

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
			if (!(atLeft && atTop)) counting.push(idx - this.size - 1);
			if (!(atRight && atTop)) counting.push(idx - this.size + 1);
			if (!(atLeft && atBottom)) counting.push(idx + this.size - 1);
			if (!(atRight && atBottom)) counting.push(idx + this.size + 1);

			usedIdx.add(idx);

			if (this.limitMap[idx]) this.limitMap[idx].counting = counting;
			else this.limitMap[idx] = {
				counting,
				countedBy: [],
			}
		}
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
}

class FourByFour extends GridData
{
	private data = new Uint16Array(3);
	public size = 4;
	public cellCnt = 16;

	public getState(idx: number)
	{
		this.data[2] = 1 << idx;
		const isStateA = (this.data[0] & this.data[2]) !== 0;
		const isStateB = (this.data[1] & this.data[2]) !== 0;
		if (isStateA && isStateB) throw new Error(`Invalid data, both bits at index #${idx} set.`);

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public setState(idx: number, state: CELL_STATE)
	{
		this.data[2] = 1 << idx;

		if (state === CELL_STATE.A) this.data[0] |= this.data[2];
		else this.data[0] &= ~this.data[2];

		if (state === CELL_STATE.B) this.data[1] |= this.data[2];
		else this.data[1] &= ~this.data[2];
	}

	public getLines(): [number, number][]
	{
		const lines: [number, number][] = [];

		this.data[2] = 0x1111;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);

		this.data[2] = 0xf;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 4;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 4;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 4;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);

		return lines;
	}
}

class SixBySix extends GridData
{
	private data = new BigUint64Array(3);
	public size = 6;
	public cellCnt = 36;

	public getState(idx: number)
	{
		const mask = BigInt(1 << idx);
		const isStateA = (this.data[0] & mask) !== 0n;
		const isStateB = (this.data[1] & mask) !== 0n;
		if (isStateA && isStateB) throw new Error(`Invalid data, both bits at index #${idx} set.`);

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public setState(idx: number, state: CELL_STATE)
	{
		this.data[2] = BigInt(1 << idx);

		if (state === CELL_STATE.A) this.data[0] |= this.data[2];
		else this.data[0] &= ~this.data[2];

		if (state === CELL_STATE.B) this.data[1] |= this.data[2];
		else this.data[1] &= ~this.data[2];
	}

	public getLines(): [BigInt, BigInt][]
	{
		const lines: [BigInt, BigInt][] = [];

		this.data[2] = 0x41041041n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 1n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);

		this.data[2] = 0x3fn;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 6n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 6n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 6n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 6n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);
		this.data[2] << 6n;
		lines.push([this.data[0] & this.data[2], this.data[1] & this.data[2]]);

		return lines;
	}
}

class EightByEight extends GridData
{
	private data = new BigUint64Array(3);
	public size = 8;
	public cellCnt = 64;

	public getState(idx: number)
	{
		const mask = BigInt(1 << idx);
		const isStateA = (this.data[0] & mask) !== 0n;
		const isStateB = (this.data[1] & mask) !== 0n;
		if (isStateA && isStateB) throw new Error(`Invalid data, both bits at index #${idx} set.`);

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public setState(idx: number, state: CELL_STATE)
	{
		const mask = BigInt(1 << idx);

		if (state === CELL_STATE.A) this.data[0] |= mask;
		else this.data[0] &= ~mask;

		if (state === CELL_STATE.B) this.data[1] |= mask;
		else this.data[1] &= ~mask;
	}

	public getLines(): [BigInt, BigInt][]
	{
		const lines: [BigInt, BigInt][] = [];

		let mask = 0x0101010101010101n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 1n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);

		mask = 0xffn;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);
		mask << 8n;
		lines.push([this.data[0] & mask, this.data[1] & mask]);

		return lines;
	}
}

class Solver
{
	private grid: GridData;
	private moveIndices: number[] = [];

	public useGrid(grid: GridData)
	{
		this.grid = grid;
		this.moveIndices.length = 0;
	}

	public getMoves(): number[]
	{
		const moves: number[] = [];

		for (let i = 0; i < this.grid.cellCnt; i++)
		{
			const state = this.grid.getState(i);
			if (state === CELL_STATE.UNSET) continue;
			moves.push(i);
		}

		return moves;
	}

	public playMove(idx: number, state: CELL_STATE): void
	{
		this.grid.setState(idx, state);
		this.moveIndices.push(idx);
	}

	public undoMove(): void
	{
		if (!this.moveIndices.length) return;
		const idx = this.moveIndices.pop()!;
		this.grid.setState(idx, CELL_STATE.UNSET);
	}

	public validateGrid(): boolean
	{
		const lines = this.grid.getLines();
		for (let i = 0, j; i < this.grid.size; i++)
		{
			const line = lines[i];

			// Check state counts per line
			let stateACnt = this.grid.size / 2, stateBCnt = stateACnt;
			for (const state of line)
			{
				if (state === CELL_STATE.A && --stateACnt <= 0) return false;
				if (state === CELL_STATE.B && --stateBCnt <= 0) return false;
			}

			if (i)
			{
				// Check if consecutive lines are same
				const nextLine = lines[i - 1];

				for (j = 0; j < this.grid.size; j++)
				{
					if (nextLine[j] !== line[j]) break;
				}

				return false;
			}
		}

		return true;
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
		const limit = data.getLimit(i);
		countEl.textContent = limit < 0 ? "" : String(limit);
	}
}

function main()
{
	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const gridData = new FourByFour();

	gridData.parseStringStates(`
		____
		a___
		____
		b___
	`);

	updateGridDisplay(gridEl, gridData);
}

main()