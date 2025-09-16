import {nanoid} from "nanoid/non-secure";
import cytoscape, {type ElementsDefinition} from "cytoscape";

enum NodeType {
	APPLICATION,
	LAMBDA,
	VARIABLE
}

abstract class Node {
	id: string;

	parent?: Node;

	abstract type: NodeType;

	public abstract substitute(lambda: LambdaNode, node: Node, scopeBindings: LambdaNode[]): Node | undefined;

	public abstract clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): Node;

	/**
	 * Returns a set of variable names that are free if this node was the root.
	 */
	public abstract bindableVariables(): Set<string>;

	abstract freeVariablesBelow(root: Node, variables: Set<string>): void;

	public abstract hasChild(node: Node): boolean;

	public scopeBindings(currentScope: LambdaNode[] = []): LambdaNode[] {
		if (this.parent) {
			return this.parent.scopeBindings(currentScope);
		} else {
			return currentScope;
		}
	};

	constructor(parent?: Node) {
		this.parent = parent;
		this.id = nanoid(6);
	}

	public render(): cytoscape.ElementsDefinition {
		const elements: ElementsDefinition = {
			nodes: [],
			edges: []
		};

		this.renderTo(elements);
		return elements;
	}

	abstract renderTo(elements: ElementsDefinition): void;
}

class ApplicationNode extends Node {
	override type = NodeType.APPLICATION;

	public left?: Node;

	public right?: Node;

	get isBetaRedex() {
		return this.left instanceof LambdaNode;
	}

	public betaReduce() {
		if (!this.isBetaRedex) {
			throw new Error('This application is not a beta redex!');
		}
	}

	public substitute(lambda: LambdaNode, node: Node, bound: LambdaNode[]): Node {
		this.left = this.left?.substitute(lambda, node, bound);
		this.right = this.right?.substitute(lambda, node, bound);
		return this;
	}

	public clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): Node {
		const clone = new ApplicationNode(newParent);
		clone.left = this.left?.clone(clone, replacements);
		clone.right = this.right?.clone(clone, replacements);
		return clone;
	}

	freeVariablesBelow(root: Node, variables: Set<string>) {
		this.left?.freeVariablesBelow(root, variables);
		this.right?.freeVariablesBelow(root, variables);
	}

	public bindableVariables(): Set<string> {
		const vars = new Set<string>();
		this.freeVariablesBelow(this, vars);
		return vars;
	}

	public hasChild(node: Node): boolean {
		if (this.left === node || this.right === node) {
			return true;
		}
		return (this.left?.hasChild(node) ?? false) || (this.right?.hasChild(node) ?? false);
	}


	renderTo(elements: cytoscape.ElementsDefinition) {
		elements.nodes.push({data: {id: this.id, label: '@'}});
		if (this.left) {
			this.left.renderTo(elements);
			elements.edges.push({data: {id: `${this.id}-${this.left.id}`, source: this.id, target: this.left.id}});
		}
		if (this.right) {
			this.right.renderTo(elements);
			elements.edges.push({data: {id: `${this.id}-${this.right.id}`, source: this.id, target: this.right.id}});
		}
	}
}

class LambdaNode extends Node {
	public type = NodeType.LAMBDA;

	public child?: Node;

	#name: string;

	constructor(parent?: Node, name: string = '') {
		super(parent);
		this.#name = name;
	}

	public rename(name: string) {
		this.#name = name;
	}

	public get name() {
		return this.#name;
	}

	public substituteThis(node: Node): Node | undefined {
		return this.child?.substitute(this, node, this.scopeBindings());
	}

	public substitute(lambda: LambdaNode, node: Node, scope: LambdaNode[]): Node | undefined {
		if (this.#name === lambda.name) {
			return this;
		}

		this.child = this.child?.substitute(lambda, node, this.scopeBindings(scope));
		return this;
	}

	public clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): LambdaNode {
		const clone = new LambdaNode(newParent);
		replacements.set(this, clone);
		clone.child = this.child?.clone(clone, replacements);
		return clone;
	}

	public override scopeBindings(currentScopeBindings: LambdaNode[] = []): LambdaNode[] {
		let scope = currentScopeBindings;
		if (!currentScopeBindings.find((binding) => binding.name === this.#name)) {
			scope = [...currentScopeBindings, this];
		}
		return super.scopeBindings(scope);
	}

	freeVariablesBelow(root: Node, freeVars: Set<string>) {
		this.child?.freeVariablesBelow(root, freeVars);
	}

	public bindableVariables(): Set<string> {
		const vars = new Set<string>();
		this.freeVariablesBelow(this, vars);
		return vars;
	}

	public hasChild(node: Node): boolean {
		if (this.child === node) {
			return true;
		}
		return this.child?.hasChild(node) ?? false;
	}

	renderTo(elements: cytoscape.ElementsDefinition) {
		elements.nodes.push({data: {id: this.id, label: `λ${this.#name}`}});
		if (this.child) {
			this.child.renderTo(elements);
			elements.edges.push({data: {id: `${this.id}-${this.child.id}`, source: this.id, target: this.child.id}});
		}
	}
}

class VariableNode extends Node {
	override type = NodeType.VARIABLE;

	private boundTo?: LambdaNode;

	#name: string = '';

	get isBound() {
		return !!this.boundTo;
	}

	public get name() {
		return this.boundTo?.name ?? this.#name;
	}

	public set name(name: string) {
		const scopeBindings = this.scopeBindings();
		let binding = scopeBindings.find((binding) => binding.name === name)
		if (binding) {
			this.boundTo = binding;
		} else {
			this.#name = name;
		}
	}

	public substitute(lambda: LambdaNode, node: Node, scopeBindings: LambdaNode[]): Node {
		if (this.boundTo !== lambda) return this;

		const clone = node.clone(this.parent, new Map());
		const freeVars = clone.bindableVariables();
		scopeBindings.forEach((binding: LambdaNode) => {
			if (freeVars.has(binding.name)) {
				binding.rename(`${binding.name}'`)
			}
		});

		return clone;
	}

	public clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): VariableNode {
		const clone = new VariableNode(newParent);
		if (this.boundTo) {
			clone.boundTo = replacements.get(this.boundTo) ?? this.boundTo;
		} else {
			clone.name = this.name;
		}

		return clone;
	}

	freeVariablesBelow(root: Node, variables: Set<string>) {
		if (!this.boundTo || !root.hasChild(this.boundTo)) {
			variables.add(this.name);
		}
	}

	public bindableVariables(): Set<string> {
		return new Set<string>(this.name);
	}

	public hasChild(_node: Node): boolean {
		return false;
	}

	renderTo(elements: cytoscape.ElementsDefinition) {
		elements.nodes.push({data: {id: this.id, label: this.name}});
	}
}

export {
	ApplicationNode,
	LambdaNode,
	VariableNode,
}