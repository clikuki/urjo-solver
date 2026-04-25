const enum CELL_STATE { A, B, UNSET }

abstract class GridData
{
	public abstract size: number;
	public abstract cellCnt: number;
	public abstract get(idx: number): CELL_STATE;
	public abstract set(idx: number, state: CELL_STATE): void;
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
	const gridData = new FourByFour();
	gridData.set(0, CELL_STATE.A);
	gridData.set(15, CELL_STATE.B);

	// // populate with test data
	// gridData[0] = 0b1001_1010_0110_0101;
	// gridData[1] = 0b0110_0101_1001_1010;

	// console.log(gridData[0]);
	// console.log(gridData[1]);

	updateGridDisplay(gridEl, gridData);
}

main()