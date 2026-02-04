/**
 * Component Tree Traverser - recursively walks Figma node tree and builds JSX elements
 *
 * OPTIMIZED: Uses a single getFileInfo call and caches the entire document tree
 * to avoid N+1 API query problems.
 */
import { JSXElementBuilder } from "../generators/jsx.js";
/**
 * Traverses Figma node tree and builds component structure
 */
export class ComponentTreeTraverser {
    api;
    context;
    builder;
    elementCache = new Map();
    nodeCache = new Map();
    fileInfo = null;
    fileKey = null;
    constructor(api, context) {
        this.api = api;
        this.context = context;
        this.builder = new JSXElementBuilder(context);
    }
    /**
     * Traverse a Figma node tree starting from the given node
     */
    async traverse(fileKey, nodeId) {
        this.elementCache.clear();
        this.nodeCache.clear();
        this.fileKey = fileKey;
        // Load the ENTIRE file once - this gives us all nodes in a single API call
        this.fileInfo = await this.api.getFileInfo(fileKey);
        // Build a lookup map for all nodes in the document
        this.buildNodeCache(this.fileInfo.document);
        // Get the root node details from cache
        const rootNode = this.nodeCache.get(nodeId);
        if (!rootNode) {
            throw new Error(`Node ${nodeId} not found in file`);
        }
        // Build the element tree using cached nodes (no more API calls!)
        const rootElement = this.buildElementTree(rootNode);
        return {
            rootElement,
            elements: this.elementCache,
            nodes: this.nodeCache,
        };
    }
    /**
     * Build a cache of all nodes in the document for fast lookup
     */
    buildNodeCache(document, parentId = null) {
        if (!document || !document.id) {
            return;
        }
        const node = document;
        this.nodeCache.set(node.id, {
            ...node,
            parentId: parentId || undefined,
        });
        // Recursively cache children
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                this.buildNodeCache(child, node.id);
            }
        }
    }
    /**
     * Find a node in the cached document tree
     */
    findNodeInTree(targetId, node) {
        if (node.id === targetId) {
            return node;
        }
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNodeInTree(targetId, child);
                if (found)
                    return found;
            }
        }
        return null;
    }
    /**
     * Build element tree recursively using cached nodes (no API calls!)
     */
    buildElementTree(node) {
        // Build current element
        const currentElement = this.builder.buildElement(node);
        // Cache for reference
        this.elementCache.set(node.id, currentElement);
        // Build children if any (using cached nodes, no API calls)
        if (node.children && node.children.length > 0) {
            const childElements = [];
            for (const childRef of node.children) {
                const childDetails = this.nodeCache.get(childRef.id);
                if (childDetails) {
                    // Recursively build child element
                    const childElement = this.buildElementTree(childDetails);
                    childElements.push(childElement);
                }
                else {
                    console.warn(`Node ${childRef.id} not found in cache, skipping`);
                }
            }
            currentElement.children = childElements;
            currentElement.isSelfClosing = childElements.length === 0;
        }
        return currentElement;
    }
    /**
     * Extend node with computed properties
     */
    extendNode(node) {
        const extended = { ...node };
        // Could add computed Tailwind classes here
        // extended.tailwindClasses = this.mapper.mapNodeStyles(node);
        return extended;
    }
    /**
     * Get component name for a node
     */
    getComponentName(node) {
        return this.builder.getComponentName(node);
    }
    /**
     * Check if a node should be a separate component
     */
    shouldExtractAsComponent(node) {
        // Component and component set nodes are definitely components
        if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
            return true;
        }
        // Frames with many children might be components
        if (node.type === "FRAME" && node.children && node.children.length > 3) {
            return true;
        }
        // Nodes with "component" in name
        const lowerName = node.name.toLowerCase();
        if (lowerName.includes("component") || lowerName.includes("widget") || lowerName.includes("module")) {
            return true;
        }
        return false;
    }
    /**
     * Find all extractable components in the tree
     * OPTIMIZED: Uses cached nodes, no API calls
     */
    findComponents(rootId) {
        const components = [];
        const traverse = (nodeId) => {
            const node = this.nodeCache.get(nodeId);
            if (!node)
                return;
            if (this.shouldExtractAsComponent(node)) {
                components.push({
                    nodeId: node.id,
                    name: this.getComponentName(node),
                    node,
                });
            }
            // Recursively check children
            if (node.children) {
                for (const child of node.children) {
                    traverse(child.id);
                }
            }
        };
        traverse(rootId);
        return components;
    }
    /**
     * Get node details from cache (no API call)
     */
    getCachedNode(nodeId) {
        return this.nodeCache.get(nodeId);
    }
    /**
     * Get multiple nodes from cache (for variant analysis)
     */
    getCachedNodes(nodeIds) {
        const result = new Map();
        for (const id of nodeIds) {
            const node = this.nodeCache.get(id);
            if (node) {
                result.set(id, node);
            }
        }
        return result;
    }
}
//# sourceMappingURL=tree.js.map