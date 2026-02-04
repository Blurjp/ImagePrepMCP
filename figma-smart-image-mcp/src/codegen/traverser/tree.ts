/**
 * Component Tree Traverser - recursively walks Figma node tree and builds JSX elements
 *
 * OPTIMIZED: Uses a single getFileInfo call and caches the entire document tree
 * to avoid N+1 API query problems.
 */

import type { FigmaApiClient, FigmaFileInfo } from "../../figma/api.js";
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { JSXElement, BuildContext, ExtendedNodeDetails } from "../utils/types.js";
import { JSXElementBuilder } from "../generators/jsx.js";

/**
 * Traverses Figma node tree and builds component structure
 */
export class ComponentTreeTraverser {
  private builder: JSXElementBuilder;
  private elementCache: Map<string, JSXElement> = new Map();
  private nodeCache: Map<string, ExtendedNodeDetails> = new Map();
  private fileInfo: FigmaFileInfo | null = null;
  private fileKey: string | null = null;

  constructor(
    private api: FigmaApiClient,
    private context: BuildContext
  ) {
    this.builder = new JSXElementBuilder(context);
  }

  /**
   * Traverse a Figma node tree starting from the given node
   */
  async traverse(fileKey: string, nodeId: string): Promise<{
    rootElement: JSXElement;
    elements: Map<string, JSXElement>;
    nodes: Map<string, ExtendedNodeDetails>;
  }> {
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
  private buildNodeCache(document: any, parentId: string | null = null): void {
    if (!document || !document.id) {
      return;
    }

    const node = document as FigmaNodeDetails;
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
  private findNodeInTree(targetId: string, node: any): any {
    if (node.id === targetId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeInTree(targetId, child);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Build element tree recursively using cached nodes (no API calls!)
   */
  private buildElementTree(node: ExtendedNodeDetails): JSXElement {
    // Build current element
    const currentElement = this.builder.buildElement(node);

    // Cache for reference
    this.elementCache.set(node.id, currentElement);

    // Build children if any (using cached nodes, no API calls)
    if (node.children && node.children.length > 0) {
      const childElements: JSXElement[] = [];

      for (const childRef of node.children) {
        const childDetails = this.nodeCache.get(childRef.id);
        if (childDetails) {
          // Recursively build child element
          const childElement = this.buildElementTree(childDetails);
          childElements.push(childElement);
        } else {
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
  private extendNode(node: FigmaNodeDetails): ExtendedNodeDetails {
    const extended: ExtendedNodeDetails = { ...node };

    // Could add computed Tailwind classes here
    // extended.tailwindClasses = this.mapper.mapNodeStyles(node);

    return extended;
  }

  /**
   * Get component name for a node
   */
  getComponentName(node: FigmaNodeDetails): string {
    return this.builder.getComponentName(node);
  }

  /**
   * Check if a node should be a separate component
   */
  shouldExtractAsComponent(node: FigmaNodeDetails): boolean {
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
  findComponents(
    rootId: string
  ): Array<{ nodeId: string; name: string; node: FigmaNodeDetails }> {
    const components: Array<{ nodeId: string; name: string; node: FigmaNodeDetails }> = [];

    const traverse = (nodeId: string): void => {
      const node = this.nodeCache.get(nodeId);
      if (!node) return;

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
  getCachedNode(nodeId: string): ExtendedNodeDetails | undefined {
    return this.nodeCache.get(nodeId);
  }

  /**
   * Get multiple nodes from cache (for variant analysis)
   */
  getCachedNodes(nodeIds: string[]): Map<string, ExtendedNodeDetails> {
    const result = new Map<string, ExtendedNodeDetails>();
    for (const id of nodeIds) {
      const node = this.nodeCache.get(id);
      if (node) {
        result.set(id, node);
      }
    }
    return result;
  }
}
