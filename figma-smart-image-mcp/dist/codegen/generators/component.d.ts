/**
 * React Component Generator - main orchestrator for code generation
 */
import type { FigmaApiClient } from "../../figma/api.js";
import type { FigmaLinkParser } from "../../figma/parse_link.js";
import type { ExportStyle, GeneratedComponent } from "../utils/types.js";
export interface ExportInput {
    url: string;
    componentName?: string;
    includeTypescript?: boolean;
    exportStyle?: ExportStyle;
    extractDesignTokens?: boolean;
    extractProps?: boolean;
}
export interface ExportOutput {
    component: GeneratedComponent;
    designTokens?: {
        tailwindConfig?: Record<string, any>;
        cssVariables?: string;
    };
    dependencies?: string[];
    metadata: {
        figmaFileKey: string;
        figmaNodeId: string;
        figmaNodeName: string;
        componentName: string;
        bounds?: {
            width: number;
            height: number;
        };
    };
}
/**
 * Generates React components from Figma designs
 */
export declare class ReactComponentGenerator {
    private api;
    private linkParser;
    constructor(api: FigmaApiClient, linkParser: typeof FigmaLinkParser);
    /**
     * Main entry point - generate React component from Figma URL
     */
    generate(input: ExportInput): Promise<ExportOutput>;
    /**
     * Extract design tokens from Figma variables
     */
    private extractDesignTokens;
    /**
     * Convert Figma variable name to CSS variable name with semantic prefixes
     */
    private variableNameToCss;
    /**
     * Get semantic prefix for variable type
     */
    private getTypePrefix;
    /**
     * Convert Figma variable value to CSS value
     */
    private variableValueToCss;
    /**
     * Format design tokens for output
     */
    private formatDesignTokens;
    /**
     * Generate the final component code
     */
    private generateComponentCode;
    /**
     * Indent code by specified number of spaces
     */
    private indentCode;
    /**
     * Get required dependencies for the generated code
     */
    private getDependencies;
}
//# sourceMappingURL=component.d.ts.map