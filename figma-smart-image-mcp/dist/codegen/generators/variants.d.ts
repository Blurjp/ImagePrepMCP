/**
 * Variant Generator - handles component sets with variants/properties
 *
 * ENHANCED: Analyzes variant instances and maps their unique styles
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { BuildContext, ExtendedNodeDetails } from "../utils/types.js";
export interface VariantProperty {
    name: string;
    values: string[];
    defaultValue: string;
}
export interface VariantInstance {
    id: string;
    name: string;
    propertyValues: Record<string, string>;
    styles: string[];
}
export interface VariantDefinition {
    componentSetName: string;
    properties: VariantProperty[];
    instances: VariantInstance[];
    variantStyles: Map<string, string>;
}
/**
 * Generates variant props for component sets with style mapping
 */
export declare class VariantGenerator {
    private context;
    constructor(context: BuildContext);
    /**
     * Check if a node is a component set (has variants)
     */
    isComponentSet(node: FigmaNodeDetails): boolean;
    /**
     * Extract variant definition from a component set with style analysis
     */
    extractVariants(componentSetNode: FigmaNodeDetails, getAllNodeDetails: (nodeId: string) => ExtendedNodeDetails | undefined): VariantDefinition | null;
    /**
     * Extract Tailwind classes from a node for variant comparison
     */
    private extractVariantStyles;
    /**
     * Analyze variant instances to find style differences
     * Returns a map of "propertyName=value" to unique Tailwind classes
     */
    private analyzeVariantStyles;
    /**
     * Find styles that are common to all instances with a specific variant value
     * but different from instances with other values
     */
    private getCommonStylesForVariant;
    /**
     * Parse Figma variant name format: "Property=Value, Other=Value"
     */
    private parseVariantName;
    /**
     * Generate TypeScript interface for variant props
     */
    generateVariantInterface(componentName: string, variants: VariantDefinition, includeTypescript: boolean): string | null;
    /**
     * Generate variant props destructuring with defaults
     */
    generateVariantDestructuring(variants: VariantDefinition, interfaceName: string | null): string;
    /**
     * Generate variant style mapping function
     */
    generateVariantStyleMapper(variants: VariantDefinition): string;
    /**
     * Check if prop is a variant prop
     */
    isVariantProp(propName: string, variants: VariantDefinition | null): boolean;
    /**
     * Get variant styles map for external access
     */
    getVariantStyles(variants: VariantDefinition): Map<string, string>;
}
//# sourceMappingURL=variants.d.ts.map