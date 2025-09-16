import {nanoid} from "nanoid/non-secure";
import cytoscape, {type ElementsDefinition} from "cytoscape";

abstract class Node {
	id: string;

	parent?: Node;

	public abstract substitute(lambda: LambdaNode, node: Node): Node | undefined;

	public abstract clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): Node;

	/**
	 * Returns a set of variable names that are free if this node was the root.
	 */
	public abstract relativeBindableVariables(): VariableNode[];

	abstract freeVariablesBelow(root: Node, variables: VariableNode[]): void;

	abstract bindBelow(): void;

	public abstract hasChild(node: Node): boolean;

	public scopeBindings(currentScope: LambdaNode[] = []): LambdaNode[] {
		if (this.parent) {
			return this.parent.scopeBindings(currentScope);
		} else {
			return currentScope;
		}
	};

	public allBindings(currentScope: LambdaNode[] = []): LambdaNode[] {
		if (this.parent) {
			return this.parent.allBindings(currentScope);
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
			nodes: [], edges: []
		};

		this.renderTo(elements);
		return elements;
	}

	abstract renderTo(elements: ElementsDefinition): void;

	public abstract toString(): string;
}

class ApplicationNode extends Node {
	public left?: Node;

	public right?: Node;

	public get isBetaRedex() {
		return this.left instanceof LambdaNode;
	}

	public betaReduce(): Node | undefined {
		if (!this.isBetaRedex) {
			throw new Error('This application is not a beta redex!');
		}
		const lambda = this.left as LambdaNode;
		if (!this.right) {
			throw new Error('There is nothing on the right to substitute!');
		}

		if (this.parent) {
			if (this.parent instanceof ApplicationNode) {
				if (this.parent.left === this) {
					this.parent.left = lambda.substituteThis(this.right);
				} else {
					this.parent.right = lambda.substituteThis(this.right);
				}
			} else if (this.parent instanceof LambdaNode) {
				this.parent.child = lambda.substituteThis(this.right);
			}
			return this.parent;
		}
		return lambda.substituteThis(this.right);
	}

	bindBelow() {
		this.left?.bindBelow();
		this.right?.bindBelow();
	}

	public substitute(lambda: LambdaNode, node: Node): Node {
		this.left = this.left?.substitute(lambda, node);
		this.right = this.right?.substitute(lambda, node);
		return this;
	}

	public clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): Node {
		const clone = new ApplicationNode(newParent);
		clone.left = this.left?.clone(clone, replacements);
		clone.right = this.right?.clone(clone, replacements);
		return clone;
	}

	freeVariablesBelow(root: Node, variables: VariableNode[]) {
		this.left?.freeVariablesBelow(root, variables);
		this.right?.freeVariablesBelow(root, variables);
	}

	public relativeBindableVariables(): VariableNode[] {
		const vars: VariableNode[] = [];
		this.freeVariablesBelow(this, vars);
		return vars;
	}

	public hasChild(node: Node): boolean {
		return (this === node || this.left === node || this.right === node || (this.left?.hasChild(node) ?? false) || (this.right?.hasChild(node) ?? false));
	}


	renderTo(elements: cytoscape.ElementsDefinition) {
		const classes = [];
		if (this.isBetaRedex) {
			classes.push('redex');
		}
		elements.nodes.push({data: {id: this.id, label: '@', scratch: {_ref: this}}, classes});
		if (this.left) {
			this.left.renderTo(elements);
			elements.edges.push({
				data: {id: `${this.id}-${this.left.id}`, source: this.id, target: this.left.id},
				classes
			});
		}
		if (this.right) {
			this.right.renderTo(elements);
			elements.edges.push({data: {id: `${this.id}-${this.right.id}`, source: this.id, target: this.right.id}});
		}
	}

	public toString(): string {
		const left = this.left?.toString() ?? '?';
		const right = this.right?.toString() ?? '?';
		return `${
			(!(this.left instanceof ApplicationNode) && left.includes(' '))
			|| this.left instanceof LambdaNode
				? `(${left})`
				: left
		} ${
			right.includes(' ')
			|| (this.right instanceof LambdaNode && this.parent instanceof ApplicationNode)
				? `(${right})`
				: right
		}`;
	}
}

class LambdaNode extends Node {
	public child?: Node;

	#name: string;

	constructor(parent?: Node, name: string = '') {
		super(parent);
		this.#name = name;
		this.bindBelow();
	}

	public get name() {
		return this.#name;
	}

	public set name(name: string) {
		this.#name = name;
		this.bindBelow();
	}

	bindBelow() {
		this.child?.bindBelow();
	}

	public substituteThis(node: Node): Node | undefined {
		if (this.child) this.child.parent = this.parent?.parent;
		return this.child?.substitute(this, node);
	}

	public substitute(lambda: LambdaNode, node: Node): Node | undefined {
		if (this.name === lambda.name) {
			return this;
		}

		this.child = this.child?.substitute(lambda, node);
		return this;
	}

	public clone(newParent: Node | undefined, replacements: Map<LambdaNode, LambdaNode>): LambdaNode {
		const clone = new LambdaNode(newParent);
		replacements.set(this, clone);
		clone.name = this.name;
		clone.child = this.child?.clone(clone, replacements);
		return clone;
	}

	public override scopeBindings(currentScopeBindings: LambdaNode[] = []): LambdaNode[] {
		let scope = currentScopeBindings;
		if (!currentScopeBindings.find((binding) => binding.name === this.name)) {
			scope = [...currentScopeBindings, this];
		}
		return super.scopeBindings(scope);
	}

	public override allBindings(currentScopeBindings: LambdaNode[] = []): LambdaNode[] {
		let scope = currentScopeBindings;
		if (!currentScopeBindings.includes(this)) {
			scope = [...currentScopeBindings, this];
		}
		return super.allBindings(scope);
	}

	freeVariablesBelow(root: Node, freeVars: VariableNode[]) {
		this.child?.freeVariablesBelow(root, freeVars);
	}

	public relativeBindableVariables(): VariableNode[] {
		const vars: VariableNode[] = [];
		this.freeVariablesBelow(this, vars);
		return vars;
	}

	public hasChild(node: Node): boolean {
		return (this === node || this.child === node || (this.child?.hasChild(node) ?? false));
	}

	renderTo(elements: cytoscape.ElementsDefinition) {
		const classes = [];
		if (this.parent instanceof ApplicationNode && this.parent.isBetaRedex && this.parent.left === this) {
			classes.push('redex');
		}
		elements.nodes.push({
			data: {
				id: this.id, label: `λ${this.name}`, scratch: {_ref: this}
			}, classes
		});
		if (this.child) {
			this.child.renderTo(elements);
			elements.edges.push({data: {id: `${this.id}-${this.child.id}`, source: this.id, target: this.child.id}});
		}
	}

	public toString(): string {
		return `\\${this.name}.${this.child?.toString() ?? '?'}`;
	}
}

class VariableNode extends Node {
	private boundTo?: LambdaNode;

	#name: string = '';

	get isBound() {
		return !!this.boundTo;
	}

	public get name() {
		return this.boundTo?.name ?? this.#name;
	}

	public set name(name: string) {
		this.#name = name;

		const scopeBindings = this.scopeBindings();
		let binding = scopeBindings.find((binding) => binding.name === name)
		if (binding) {
			this.boundTo = binding;
		} else {
			this.boundTo = undefined;
		}
	}

	bindBelow() {
		if (this.boundTo) return;
		const scopeBindings = this.scopeBindings();
		let binding = scopeBindings.find((binding) => binding.name === this.#name)
		if (binding) {
			this.boundTo = binding;
		}
	}

	public substitute(lambda: LambdaNode, node: Node): Node {
		if (this.boundTo !== lambda) return this;

		debugger;
		const freeVars = node.relativeBindableVariables();
		console.debug('Free vars', freeVars);
		const toRename: LambdaNode[] = [];
		const noRename: LambdaNode[] = [];

		const bindings = this.allBindings();
		bindings.forEach((binding: LambdaNode) => {
			if (binding === lambda) return;

			if (freeVars.filter((v) => v.name === binding.name && v.boundTo !== binding).length > 0) {
				toRename.push(binding);
			} else {
				noRename.push(binding);
			}
		});

		console.debug('To rename', toRename);
		console.debug('Not renaming', noRename)

		toRename.forEach((binding: LambdaNode) => {
			let newName = `${binding.name}'`
			while (noRename.find((b) => b.name === newName)) {
				newName += "'";
			}
			binding.name = newName;
		});

		return node.clone(this.parent === lambda ? undefined : this.parent, new Map());
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

	freeVariablesBelow(root: Node, variables: VariableNode[]) {
		if (!this.boundTo || !root.hasChild(this.boundTo)) {
			variables.push(this);
		}
	}

	public relativeBindableVariables(): VariableNode[] {
		const vars: VariableNode[] = [];
		vars.push(this);
		return vars;
	}

	public hasChild(node: Node): boolean {
		return this === node;
	}

	renderTo(elements: cytoscape.ElementsDefinition) {
		elements.nodes.push({data: {id: this.id, label: this.name, scratch: {_ref: this}}});
	}

	public toString() {
		return this.name;
	}
}

class PlaceholderNode extends Node {
	clone(newParent: Node | undefined, _replacements: Map<LambdaNode, LambdaNode>): Node {
		return new PlaceholderNode(newParent);
	}

	freeVariablesBelow(_root: Node, _variables: VariableNode[]): void {
		return;
	}

	hasChild(_node: Node): boolean {
		return false;
	}

	relativeBindableVariables(): VariableNode[] {
		return [];
	}

	renderTo(elements: cytoscape.ElementsDefinition): void {
		elements.nodes.push({data: {id: this.id, label: '?', scratch: {_ref: this}}, classes: ['placeholder']});
	}

	substitute(_lambda: LambdaNode, _node: Node): Node | undefined {
		return this;
	}

	bindBelow(): void {
		return;
	}

	public toString() {
		return '?';
	}
}

export {
	Node, ApplicationNode, LambdaNode, VariableNode, PlaceholderNode,
}