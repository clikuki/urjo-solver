// abstract class GridData {
// 	public abstract get(idx: number): number; 
// 	public abstract set(idx: number, val: number): number; 
// }

// class FourByFour extends GridData {
// 	private data = new Uint16Array(2);
// 	private indexA = 0
// 	private indexB = 0

// 	public get(idx: number): number
// 	{

// 	}

// 	public set(idx: number, val: number): number
// 	{

// 	}
// }

const cellTemplate = document.querySelector(".cell-template") as HTMLTemplateElement;
function createCellFragment(id: number): DocumentFragment
{
	// const cell = document.createElement("div");
	// cell.className = "cell";

	// const sideA = document.createElement("div");
	// const sideB = document.createElement("div");
	// sideA.className = "side side-A";
	// sideB.className = "side side-B";

	// sideB.className = "side side-B";

	const cellFrag = document.importNode(cellTemplate.content, true);
	const cell = cellFrag.querySelector(".cell");
	if (!cell) throw new Error("Cell template does not match expected structure");

	cell.id = `cell-${id}`;

	return cellFrag;
}

function updateGridDisplay(
	gridEl: HTMLElement,
	gridData: Uint16Array,
	size: number
): void
{
	if (size < 4 || size % 2 === 1) throw new Error("Invalid size.");
	gridEl.style.setProperty("--size", String(size));

	const cellCnt = size * size;

	if (gridEl.childElementCount > cellCnt)
	{
		const excessCells = gridEl.querySelectorAll(`:nth-child(n + ${cellCnt + 1})`)
		excessCells.forEach(c => c.remove());
	}
	else for (let i = gridEl.childElementCount; i < cellCnt; i++)
	{
		const cellFrag = createCellFragment(i);
		gridEl.appendChild(cellFrag);
	}

	// TODO: abstract away grid data access
	for (let i = 0; i < cellCnt; i++)
	{
		const mask = 1 << i;
		const isStateA = (gridData[0] & mask) !== 0;
		const isStateB = (gridData[1] & mask) !== 0;
		if (isStateA && isStateB) throw new Error("Invalid data, both masks set.");

		const cellEl = gridEl.children[i]
		if (isStateA) cellEl.setAttribute("data-state", "A");
		else if (isStateB) cellEl.setAttribute("data-state", "B");
		else cellEl.setAttribute("data-state", "UNSET");
	}
}

function main()
{
	const gridEl = document.body.querySelector(".grid") as HTMLElement;
	const gridData = new Uint16Array(2); // 4x4

	// populate with test data
	gridData[0] = 0b1001_1010_0110_0101;
	gridData[1] = 0b0110_0101_1001_1010;

	console.log(gridData[0]);
	console.log(gridData[1]);

	updateGridDisplay(gridEl, gridData, 4);
}

main()