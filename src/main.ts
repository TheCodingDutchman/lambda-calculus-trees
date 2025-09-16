import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import {ApplicationNode, LambdaNode, VariableNode} from "./Nodes.ts";
import './style.css'

// @ts-ignore
cytoscape.use(dagre);

const root = new ApplicationNode();
root.left = new LambdaNode(root, "x");
(root.left as LambdaNode).child = new VariableNode(root.left);
((root.left as LambdaNode).child as VariableNode).name = "x";
root.right = new ApplicationNode(root);
(root.right as ApplicationNode).left = new LambdaNode(root.right, "y");
((root.right as ApplicationNode).left as LambdaNode).child = new VariableNode((root.right as ApplicationNode).left);
(((root.right as ApplicationNode).left as LambdaNode).child as VariableNode).name = "y";
(root.right as ApplicationNode).right = new VariableNode(root.right);
((root.right as ApplicationNode).right as VariableNode).name = "x";

const cy = cytoscape({
	container: document.getElementById('app'),
	layout: {
		name: 'dagre'
	},
	elements: root.render()
});

console.log(root)