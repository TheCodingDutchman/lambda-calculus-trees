import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import cxtmenu from 'cytoscape-cxtmenu';
import {Node, ApplicationNode, VariableNode, PlaceholderNode, LambdaNode} from "./Nodes.ts";
import './style.css'
import parseExpression from "./expressionParser.ts";
import getTerm, {savedTerms} from "./knownTerms.ts";
import {Notyf} from 'notyf';
import 'notyf/notyf.min.css';

const CURRENT_VERSION = '1.2.2';

const notyf = new Notyf();

// @ts-expect-error
cytoscape.use(dagre);
// @ts-expect-error
cytoscape.use(cxtmenu);

let root: Node | undefined = parseExpression('(\\x.\\y.\\y\'.x (y y\')) y');

const expressionInput = document.getElementById('expression') as HTMLInputElement;
expressionInput.value = '(\\x.\\y.\\y\'.x (y y\')) y';
const cleanExpression = document.getElementById('clean-expression') as HTMLInputElement;
cleanExpression.value = '(λx.λy.λy\'.x (y y\')) y';

const cy = cytoscape({
	container: document.getElementById('app'),
	layout: {
		name: 'dagre'
	},
	style: [
		{
			selector: "node[label]",
			style: {
				label: "data(label)",
				color: 'black',
				"text-valign": "center",
				"text-halign": "center",
			}
		},
		{
			selector: "edge[label]",
			style: {
				label: "data(label)",
				width: 3
			}
		},
		{
			selector: 'node',
			style: {
				backgroundColor: 'white'
			}
		},
		{
			selector: ".redex",
			style: {
				backgroundColor: '#ff0000',
				"line-color": "#ff0000",
			}
		},
		{
			selector: ".placeholder",
			style: {
				backgroundColor: '#84e584',
				color: 'black',
			}
		}
	],
	autoungrabify: true,
	elements: root!.render()
});

function rerender() {
	cy.elements().remove();
	if (!root) {
		root = new PlaceholderNode();
	}
	cy.add(root.render());
	const str = root.toString();
	expressionInput.value = str;
	cleanExpression.value = str.replace('\\', 'λ');

	cy.layout({name: 'dagre'}).run();
}

function replacePlaceholderNode(placeholder: Node, node: Node) {
	if (root === placeholder) {
		root = node;
		rerender();
		return;
	}

	if (placeholder.parent) {
		if (placeholder.parent instanceof ApplicationNode) {
			if (placeholder.parent.left === placeholder) {
				placeholder.parent.left = node;
			} else if (placeholder.parent.right === placeholder) {
				placeholder.parent.right = node;
			}
		} else if (placeholder.parent instanceof LambdaNode) {
			if (placeholder.parent.child === placeholder) {
				placeholder.parent.child = node;
			}
		}
		rerender();
	}
}

cy.cxtmenu({
	commands: (node): cxtmenu.Command[] => {
		const ref = node.data('scratch')._ref as Node;
		if (ref instanceof ApplicationNode) {
			const commands: cxtmenu.Command[] = [
				{
					content: 'β-reduce',
					select: () => {
						if (ref.isBetaRedex) {
							if (ref === root) {
								root = ref.betaReduce();
								console.log('root', root);
							} else {
								ref.betaReduce();
								console.log('root', root);
							}
							rerender();
						} else {
							alert('Not a beta redex');
						}
					},
					enabled: ref.isBetaRedex,
				},
			];

			if (!(ref.left instanceof PlaceholderNode)) {
				commands.push({
					content: 'Remove left',
					select: () => {
						ref.left = new PlaceholderNode(ref);
						rerender();
					},
				});
			}

			if (!(ref.right instanceof PlaceholderNode)) {
				commands.push({
					content: 'Remove right',
					select: () => {
						ref.right = new PlaceholderNode(ref);
						rerender();
					},
				});
			}

			return commands;
		} else if (ref instanceof LambdaNode) {
			const commands: cxtmenu.Command[] = [
				{
					content: 'Rename',
					select: () => {
						const newName = prompt('Enter new name', ref.name);
						if (newName && newName.trim().length > 0) {
							ref.name = newName;
							rerender();
						}
					}
				}
			];

			if (!(ref.child instanceof PlaceholderNode)) {
				commands.push({
					content: 'Remove child',
					select: () => {
						ref.child = new PlaceholderNode(ref);
						rerender();
					},
				})
			}

			return commands;
		} else if (ref instanceof VariableNode) {
			return [
				{
					content: 'Rename',
					select: () => {
						const newName = prompt('Enter new name', ref.name);
						if (newName && newName.trim().length > 0) {
							ref.name = newName;
							rerender();
						}
					}
				}
			];
		} else if (ref instanceof PlaceholderNode) {
			return [
				{
					content: 'Lambda',
					select: () => {
						const name = prompt('Enter lambda name');
						if (name && name.trim().length > 0) {
							const node = new LambdaNode(ref.parent);
							node.name = name;
							node.child = new PlaceholderNode(node);
							replacePlaceholderNode(ref, node);
						}
					}
				},
				{
					content: 'Application',
					select: () => {
						const node = new ApplicationNode(ref.parent);
						node.left = new PlaceholderNode(node);
						node.right = new PlaceholderNode(node);
						replacePlaceholderNode(ref, node);
					}
				},
				{
					content: 'Variable',
					select: () => {
						const name = prompt('Enter variable name');
						if (name && name.trim().length > 0) {
							const node = new VariableNode(ref.parent);
							node.name = name;
							replacePlaceholderNode(ref, node);
						}
					}
				},
				{
					content: 'Well known term',
					select: () => {
						const term = prompt('Enter term name');
						if (term && term.trim().length > 0) {
							replacePlaceholderNode(ref, getTerm(ref.parent, term.trim()))
						}
					}
				}
			]
		}

		return []
	},
	openMenuEvents: 'cxttapstart tapstart'
});

document.getElementById('eval-input')!.addEventListener('submit', (e) => {
	e.preventDefault();
	try {
		root = parseExpression(expressionInput.value.trim());
		rerender();
	} catch (e) {
		notyf.error(e instanceof Error ? e.message : 'An error occurred during parsing');
		console.error(e);
	}
});


document.getElementById('save-button')!.addEventListener('click', () => {
	const term = root?.toString() ?? '';
	if (term.trim().length === 0 || term.includes('?')) {
		notyf.error('Cannot save empty expressions or expressions with placeholders');
		return;
	}

	const name = prompt('Enter term name');
	if (name) {
		if (name.includes('?') || name.includes(' ') || name.includes('\\') || name.includes('λ') || name.includes('.') || name.includes('(') || name.includes(')')) {
			notyf.error('Term name cannot contain spaces or any of the following characters: ? \\ λ . ( )');
			return;
		}

		const nameLower = name.toLowerCase();
		if (savedTerms[nameLower] && !confirm('A term with this name already exists. Overwrite?')) {
			return;
		}
		savedTerms[nameLower] = term;
		localStorage.setItem('saved-terms', JSON.stringify(savedTerms));
		notyf.success(`Saved term as '${nameLower}'`);
	}
});

document.getElementById('show-saved-terms-btn')?.addEventListener('click', () => {
	const dialog = document.getElementById('saved-terms-dialog')! as HTMLDialogElement;

	document.getElementById('saved-terms')!.innerHTML = `
		<ul>
			${Object.entries(savedTerms).map(([key, value]) => `<li><strong>${key}</strong>: <code>${value.replaceAll('\\', 'λ')}</code></li>`).join('\n')}
		</ul>
	`;

	dialog.showModal();
});

const changelogDialog = document.getElementById('changelog')! as HTMLDialogElement;
const lastVersion = localStorage.getItem('lastVersion');
if (lastVersion !== CURRENT_VERSION) {
	changelogDialog.showModal();
	localStorage.setItem('lastVersion', CURRENT_VERSION);
}

const helpDialog = document.getElementById('help-dialog')! as HTMLDialogElement;
const hasVisited = localStorage.getItem('has-visited');
if (!hasVisited) {
	helpDialog.showModal();
	localStorage.setItem('has-visited', 'true');
}