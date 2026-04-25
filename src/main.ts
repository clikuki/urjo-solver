const enum CELL_STATE { A, B, UNSET }

abstract class GridData
{
	public abstract size: number;
	public abstract cellCnt: number;
	public abstract get(idx: number): CELL_STATE;
	public abstract set(idx: number, state: CELL_STATE): void;

	public use(
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

			this.set(idx++, state);
		}

		// Clear remaining cells, if any
		while (idx < this.cellCnt)
		{
			this.set(idx++, CELL_STATE.UNSET);
		}
	}
}

class FourByFour extends GridData
{
	private data = new Uint16Array(2);
	public size = 4;
	public cellCnt = 16;

	public get(idx: number)
	{
		const mask = 1 << idx;
		const isStateA = (this.data[0] & mask) !== 0;
		const isStateB = (this.data[1] & mask) !== 0;
		if (isStateA && isStateB) throw new Error("Invalid data, both masks set.");

		if (isStateA) return CELL_STATE.A;
		else if (isStateB) return CELL_STATE.B;
		else return CELL_STATE.UNSET;
	}

	public set(idx: number, state: CELL_STATE)
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

	public get(idx: number)
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

	public set(idx: number, state: CELL_STATE)
	{
		const arrayIdx = idx >> 3;
		const mask = 1 << (idx - (arrayIdx << 3));

		if (state === CELL_STATE.A) this.data[arrayIdx] |= mask;
		else this.data[arrayIdx] &= ~mask;

		if (state === CELL_STATE.B) this.data[arrayIdx + 5] |= mask;
		else this.data[arrayIdx + 5] &= ~mask;
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
		const state = data.get(i);
		const cellEl = gridEl.children[i]
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
}

function main()
{
	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const gridData = new SixBySix();

	gridData.use(`
		____a_
		______
		____a_
		b_____
		______
		______
	`);

	updateGridDisplay(gridEl, gridData);
}

main()