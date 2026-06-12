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

		console.info("LOADED PRESETS FROM STORAGE:", initPresets);
		console.info("LOADED LAST PRESET FROM STORAGE:", initUsed);

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
		// solver = new BiStateSolver(gridData);
		solver = new GroupSolver(gridData);
	
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
	
	gridEl.addEventListener("wheel", (e) => {
		if(keepSolving) return;

		const sideEl = e.target;
		if(!(sideEl instanceof HTMLElement)) return;
		const cellEl = sideEl.parentElement;
		if(!(cellEl instanceof HTMLElement && cellEl.classList.contains("cell"))) return;
		
		const dir = -Math.sign(e.deltaY);
		const index = +cellEl.id.split("-")[1];
		const currentLimit = gridData.getLimitCount(index);
		const newLimit = currentLimit + dir;

		if(Math.max(currentLimit, newLimit) < 0) return;

		gridData.setLimit(index, newLimit);
		updateGridDisplay(gridEl, gridData);

		presets.setCurrent(gridData.toString());
		presets.save();
		refreshSolver = true;
	}, {
		passive: true,
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

	solveBtn.addEventListener("contextmenu", (e) => {
		e.preventDefault();

		keepSolving = false;
		if(refreshSolver) {
			presetStr = gridData.toString();
			solver.useGrid(gridData);
		}

		const startTime = performance.now();
		while(!solver.isComplete) solver.step();
		const duration = (performance.now() - startTime) / 1000;
		console.log(`Remaining solve took ${duration}s to complete.`);

		updateGridDisplay(gridEl, gridData);
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

		const action = btnEl.getAttribute("data-action") as "USE" | "REPLACE" | "TIME" | "DELETE";
		
		switch(action) {
			case "USE":
				presetStr = presets.get(presetEl.id)!;
				reset();
				sizeSel.value = gridData.size.toString();
				break;

			case "TIME":
				const tmpPreset = presets.get(presetEl.id)!;
				const tmpGrid = GridData.fromString(tmpPreset)
				const tmpSolver = new BiStateSolver(tmpGrid);
				const startTime = performance.now();
				while(!tmpSolver.isComplete) tmpSolver.step();
				const duration = (performance.now() - startTime) / 1000;
				console.log(`Took ${duration}s to complete.`);
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

		let stateStr = "IN-PROGRESS";
		if(solver.isComplete) {
			if(solver.solutions.length) stateStr = "COMPLETE";
			else stateStr = "INVALID";
		}

		stateDisplayEl.setAttribute("data-state", stateStr);
	})

	loadPresets(presetsListEl);
	updateGridDisplay(gridEl, gridData);
	
	// @ts-expect-error
	window.solver = solver;
	// @ts-expect-error
	window.render = () => updateGridDisplay(gridEl, gridData);
}

main();