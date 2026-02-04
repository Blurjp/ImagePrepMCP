/**
 * Props Generator - extracts dynamic content and generates TypeScript interfaces
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { PropDefinition, JSXElement, BuildContext } from "../utils/types.js";
/**
 * Generates component props from Figma nodes
 */
export declare class PropsGenerator {
    private context;
    private props;
    private nextDefaultIndex;
    constructor(context: BuildContext);
    /**
     * Extract props from a component tree
     */
    extractProps(node: FigmaNodeDetails, elements: Map<string, JSXElement>): PropDefinition[];
    /**
     * Traverse node tree to find props
     */
    private traverseForProps;
    /**
     * Check if a node should be extracted as a prop
     */
    private shouldBeProp;
    /**
     * Generate a prop name from node
     */
    private generatePropName;
    /**
     * Generate prop definition from node
     */
    private generatePropDefinition;
    /**
     * Check if component has slot content
     */
    private hasSlotContent;
    /**
     * Generate TypeScript interface for props
     */
    generateInterface(componentName: string, props: PropDefinition[], includeTypescript: boolean): string | null;
    /**
     * Generate props destructuring for component
     */
    generateDestructuring(props: PropDefinition[], interfaceName: string | null): string;
    /**
     * Find prop by node ID
     */
    findPropByNodeId(nodeId: string, props: PropDefinition[]): PropDefinition | undefined;
}
//# sourceMappingURL=props.d.ts.map