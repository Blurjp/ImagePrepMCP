/**
 * JSX Element Builder - converts Figma nodes to JSX elements
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { JSXElement, BuildContext } from "../utils/types.js";
/**
 * Builds JSX elements from Figma nodes
 */
export declare class JSXElementBuilder {
    private context;
    private mapper;
    constructor(context: BuildContext);
    /**
     * Build a JSX element from a Figma node
     */
    buildElement(node: FigmaNodeDetails, children?: JSXElement[]): JSXElement;
    /**
     * Map Figma node type to HTML tag
     */
    private mapNodeTypeToTag;
    /**
     * Infer semantic HTML tag for text nodes
     */
    private inferTextTag;
    /**
     * Build props object for the JSX element
     */
    private buildProps;
    /**
     * Convert classes to twin.macro format
     * Converts: ["flex", "p-4", "bg-blue-500"]
     * To: "flex p-4 bg-blue-500"
     */
    private classesToTwinMacro;
    /**
     * Convert classes array to string
     */
    private classesToString;
    /**
     * Check if element already has size classes
     */
    private hasSizeClass;
    /**
     * Generate component name from node
     */
    getComponentName(node: FigmaNodeDetails): string;
    /**
     * Generate a safe prop name from node name
     */
    getPropName(node: FigmaNodeDetails): string;
    /**
     * Check if node should be extracted as a prop
     */
    shouldExtractAsProp(node: FigmaNodeDetails): boolean;
}
/**
 * Convert a JSX element to string representation
 */
export declare function jsxToString(element: JSXElement, indent?: number): string;
/**
 * Format JSX for output in a React component
 */
export declare function formatJSXForComponent(element: JSXElement, indent?: number): string;
//# sourceMappingURL=jsx.d.ts.map