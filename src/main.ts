const enum CELL_STATE { A, B, UNSET }

abstract class GridData
{
	public abstract size: number;
	public abstract cellCnt: number;
	public abstract getState(idx: number): CELL_STATE;
	public abstract setState(idx: number, state: CELL_STATE): void;

	// limits format: idx_1, limit_1, idx_2, limit_2, ..., idx_n, limit_n,
	// unlikely to change over course of grid lifespan, set once at start
	private limits: [number, number][] = [];
	public getLimit(idx: number): number
	{
		for (const [i, lim] of this.limits)
		{
			if (i === idx) return lim;
		}

		return 0;
	}

	public getLimits(): readonly [number, number][]
	{
		return this.limits;
	}

	// Limit validation
	public setAllLimits(limitList: [idx: number, limit: number][]): void
	{
		this.limits.length = 0;

		const usedIdx = new Set<number>();
		for (const [idx, limit] of limitList)
		{
			if (usedIdx.has(idx)) throw new Error("Non-unique limit index found.");
			if (limit > 8) throw new Error("Limit must not exceed 8.");
			if (limit < 0) throw new Error("Limit cannot be negative.");

			const x = idx % this.size;
			const y = Math.floor(idx / this.size);
			const atLeft = x === 0;
			const atRight = x === this.size - 1;
			const atTop = y === 0;
			const atBottom = y === this.size - 1;
			if ((atLeft || atRight) && (atTop || atBottom) && limit > 3)
			{
				throw new Error("Limit at corner cannot exceed 3.");
			}
			if ((atLeft || atRight || atTop || atBottom) && limit > 5)
			{
				throw new Error("Limit at edge cannot exceed 5.");
			}

			usedIdx.add(idx);
			this.limits.push([idx, limit]);
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
	private data = new Uint16Array(2);
	public size = 4;
	public cellCnt = 16;

	public getState(idx: number)
	{
		const mask = 1 << idx;
		const isStateA = (this.data[0] & mask) !== 0;
		const isStateB = (this.data[1] & mask) !== 0;
		if (isStateA && isStateB) throw new Error("Invalid data, both masks set.");

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public setState(idx: number, state: CELL_STATE)
	{
		const mask = 1 << idx;

		if (state === CELL_STATE.A) this.data[0] |= mask;
		else this.data[0] &= ~mask;

		if (state === CELL_STATE.B) this.data[1] |= mask;
		else this.data[1] &= ~mask;
	}
}

class SixBySix extends GridData
{
	private data = new Uint8Array(10);
	public size = 6;
	public cellCnt = 36;

	public getState(idx: number)
	{
		const arrayIdx = idx >> 3;
		const mask = 1 << (idx - (arrayIdx << 3));
		const isStateA = (this.data[arrayIdx] & mask) !== 0;
		const isStateB = (this.data[arrayIdx + 5] & mask) !== 0;
		if (isStateA && isStateB) throw new Error("Invalid data, both masks set.");

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public setState(idx: number, state: CELL_STATE)
	{
		const arrayIdx = idx >> 3;
		const mask = 1 << (idx - (arrayIdx << 3));

		if (state === CELL_STATE.A) this.data[arrayIdx] |= mask;
		else this.data[arrayIdx] &= ~mask;

		if (state === CELL_STATE.B) this.data[arrayIdx + 5] |= mask;
		else this.data[arrayIdx + 5] &= ~mask;
	}
}

class EightByEight extends GridData
{
	private data = new Uint32Array(4);
	public size = 8;
	public cellCnt = 64;

	public getState(idx: number)
	{
		const arrayIdx = idx >> 5;
		const mask = 1 << (idx - (arrayIdx << 5));
		const isStateA = (this.data[arrayIdx] & mask) !== 0;
		const isStateB = (this.data[arrayIdx + 2] & mask) !== 0;
		if (isStateA && isStateB) throw new Error("Invalid data, both masks set.");

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public setState(idx: number, state: CELL_STATE)
	{
		const arrayIdx = idx >> 5;
		const mask = 1 << (idx - (arrayIdx << 5));

		if (state === CELL_STATE.A) this.data[arrayIdx] |= mask;
		else this.data[arrayIdx] &= ~mask;

		if (state === CELL_STATE.B) this.data[arrayIdx + 2] |= mask;
		else this.data[arrayIdx + 2] &= ~mask;
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
	}

	// TODO: clear previous limit text
	for (const [idx, lim] of data.getLimits())
	{
		const cellEl = gridEl.children[idx];
		const countEl = cellEl.querySelector(".count") as HTMLElement;
		countEl.textContent = String(lim);
	}
}

function main()
{
	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const gridData = new EightByEight();

	gridData.parseStringStates(`
		____a_a_
		a_____b_
		____a_b_
		b_____a_
		__a___b_
		______a_
		____a_a_
		______b_
	`);
	gridData.setAllLimits([
		[3, 4],
		[14, 8],
	])

	updateGridDisplay(gridEl, gridData);
}

main()