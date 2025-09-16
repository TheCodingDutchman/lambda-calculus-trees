import {ApplicationNode, LambdaNode, type Node, VariableNode} from "./Nodes.ts";
import {parseSubexpression} from "./expressionParser.ts";

function churchNumeral(parent: Node | undefined, x: number): LambdaNode {
	if (x < 0) {
		throw new Error('Cannot represent numbers below 0');
	}

	const sLambda = new LambdaNode(parent, 's');
	const zLambda = new LambdaNode(sLambda, 'z');
	sLambda.child = zLambda;

	const zVar = new VariableNode(zLambda);
	zVar.name = 'z';

	let numberRoot: Node = zVar;

	for (let i = 0; i < x; i++) {
		const increment = new ApplicationNode(zLambda);
		const sVar = new VariableNode(increment);
		sVar.name = 's';
		increment.left = sVar;
		increment.right = numberRoot;
		numberRoot.parent = increment;
		numberRoot = increment;
	}

	zLambda.child = numberRoot;

	return sLambda;
}

export const savedTerms: { [key: string]: string } = JSON.parse(localStorage.getItem('saved-terms') || '{}');

export default function getTerm(parent: Node | undefined, term: string): Node {
	let lowercaseTerm = term.toLowerCase();

	if (lowercaseTerm === 'i' || lowercaseTerm === 'identity') {
		const lambdaNode = new LambdaNode(parent, 'x');

		const varNode = new VariableNode(lambdaNode);
		varNode.name = 'x';
		lambdaNode.child = varNode;

		return lambdaNode;
	} else if (['omega', 'o'].includes(lowercaseTerm) || term === 'Ω') {
		const { node } = parseSubexpression(parent, '(\\x.x x)(\\x.x x)', 0);
		return node;
	} else if (lowercaseTerm === 'y') {
		const { node } = parseSubexpression(parent, '\\f.(\\x.f (x x))(\\x.f (x x))', 0);
		return node;
	} else if (lowercaseTerm === 'k') {
		const xLambda = new LambdaNode(parent, 'x');
		const yLambda = new LambdaNode(xLambda, 'y');
		xLambda.child = yLambda;

		const xVar = new VariableNode(yLambda);
		xVar.name = 'x';
		yLambda.child = xVar;

		return xLambda;
	} else if (/^c\d+$/.test(lowercaseTerm)) {
		let number = Number.parseInt(term.substring(1), 10);
		if (Number.isNaN(number) || number < 0) {
			throw new Error('Invalid input for church number');
		}
		return churchNumeral(parent, number);
	} else if (savedTerms[lowercaseTerm]) {
		const { node } = parseSubexpression(parent, savedTerms[lowercaseTerm], 0);
		return node;
	} else {
		throw new Error('Unknown term: ' + term);
	}
}
