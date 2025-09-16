import {Node, ApplicationNode, VariableNode, LambdaNode, PlaceholderNode} from "./Nodes.ts";
import getTerm from "./knownTerms.ts";

export function parseSubexpression(parent: Node | undefined, input: string, index: number, tillParenthesis: boolean = false, breakAtApplication: boolean = false): { node: Node, index: number } {
	let retNode: Node | undefined = undefined;

	let i = index;
	while (i < input.length) {
		let char = input[i++];

		if (char === '\\' || char === 'λ' || char === 'L') {
			let name = '';

			char = input[i];
			while (char !== '.' && i < input.length) {
				if ([' ', '\\', 'λ', '(', ')', '?'].includes(char)) throw new Error(`Illegal character '${char}' in lambda name`);
				name += char;
				char = input[++i];
			}
			if (char !== '.') throw new Error(`Expected . after lambda name at index ${i}`);
			if (name.length === 0) throw new Error(`Lambda at index ${i} has no name`);
			i++;

			const node = new LambdaNode(parent, name);

			const { node: child, index: childIdx } = parseSubexpression(node, input, i);
			node.child = child;
			retNode = node;
			i = childIdx;

			if (tillParenthesis && input[i] === ')') {
				i++;
			}

			break;
		} else if (char === '(') {
			if (retNode) {
				const node = new ApplicationNode(parent);
				node.left = retNode;
				node.left.parent = node;

				let { node: right, index } = parseSubexpression(node, input, i, true);
				node.right = right;
				i = index;

				retNode = node;
			} else {
				const {node, index} = parseSubexpression(parent, input, i, true);
				retNode = node;
				i = index;
			}
		} else if (char === ')') {
			if (!tillParenthesis) {
				i--;
			}
			break;
		} else if (char === ' ') {
			if (breakAtApplication) {
				i--;
				break;
			}

			if (!retNode) {
				continue;
			}

			const node = new ApplicationNode(parent);
			node.left = retNode;
			node.left.parent = node;

			let { node: right, index } = parseSubexpression(node, input, i, false, true);
			node.right = right;
			i = index;

			retNode = node;
		} else if (char === '.') {
			throw new Error(`Illegal character . found at index ${i - 1}`);
		} else if (char === '$') {
			let term = '';

			char = input[i];
			while (!['\\', 'λ', ' ', '.', '(', ')', '?'].includes(char) && i < input.length) {
				term += char;
				char = input[++i];
			}
			if (term.length === 0) throw new Error(`Term at index ${i} has no name!`);

			retNode = getTerm(parent, term);
		} else if (char === '?') {
			retNode = new PlaceholderNode(parent);
		} else {
			let name = '';

			while (!['\\', 'λ', ' ', '.', '(', ')', '?'].includes(char) && i <= input.length) {
				if (char === '.' || char === '\\' || char === 'λ') throw new Error(`Illegal character '${char}' in variable name at index ${i - 1}`);
				name += char;
				char = input[i++];
			}
			i--;
			if (name.length === 0) throw new Error(`Variable at index ${i} has no name`);

			const node = new VariableNode(parent);
			node.name = name;
			retNode = node;
		}
	}

	if (!retNode) {
		retNode = new PlaceholderNode(parent);
	}

	return { node: retNode, index: i };
}

export default function parseExpression(input: string): Node {
	const { node, index } = parseSubexpression(undefined, input, 0);
	if (index < input.length) {
		throw new Error(`Unexpected characters at end of input starting at index ${index}`);
	}
	return node;
}