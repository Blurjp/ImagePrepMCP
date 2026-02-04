/**
 * Component Tree Traverser - recursively walks Figma node tree and builds JSX elements
 *
 * OPTIMIZED: Uses a single getFileInfo call and caches the entire document tree
 * to avoid N+1 API query problems.
 */
import type { FigmaApiClient } from "../../figma/api.js";
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { JSXElement, BuildContext, ExtendedNodeDetails } from "../utils/types.js";
/**
 * Traverses Figma node tree and builds component structure
 */
export declare class ComponentTreeTraverser {
    private api;
    private context;
    private builder;
    private elementCache;
    private nodeCache;
    private fileInfo;
    private fileKey;
    constructor(api: FigmaApiClient, context: BuildContext);
    /**
     * Traverse a Figma node tree starting from the given node
     */
    traverse(fileKey: string, nodeId: string): Promise<{
        rootElement: JSXElement;
        elements: Map<string, JSXElement>;
        nodes: Map<string, ExtendedNodeDetails>;
    }>;
    /**
     * Build a cache of all nodes in the document for fast lookup
     */
    private buildNodeCache;
    /**
     * Find a node in the cached document tree
     */
    private findNodeInTree;
    /**
     * Build element tree recursively using cached nodes (no API calls!)
     */
    private buildElementTree;
    /**
     * Extend node with computed properties
     */
    private extendNode;
    /**
     * Get component name for a node
     */
    getComponentName(node: FigmaNodeDetails): string;
    /**
     * Check if a node should be a separate component
     */
    shouldExtractAsComponent(node: FigmaNodeDetails): boolean;
    /**
     * Find all extractable components in the tree
     * OPTIMIZED: Uses cached nodes, no API calls
     */
    findComponents(rootId: string): Array<{
        nodeId: string;
        name: string;
        node: FigmaNodeDetails;
    }>;
    /**
     * Get node details from cache (no API call)
     */
    getCachedNode(nodeId: string): ExtendedNodeDetails | undefined;
    /**
     * Get multiple nodes from cache (for variant analysis)
     */
    getCachedNodes(nodeIds: string[]): Map<string, ExtendedNodeDetails>;
}
//# sourceMappingURL=tree.d.ts.map