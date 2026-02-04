/**
 * Typography mapper - Figma text styles to Tailwind typography classes
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
/**
 * Maps Figma text properties to Tailwind CSS classes
 */
export declare class TypographyMapper {
    /**
     * Map all text styles to Tailwind classes
     */
    mapTextStyle(node: FigmaNodeDetails): string[];
    /**
     * Map font size to text-{size} class
     */
    mapFontSize(fontSize: number): string;
    /**
     * Map font weight to font-{weight} class
     */
    mapFontWeight(fontWeight: number): string;
    /**
     * Map line height to leading class
     */
    mapLineHeight(lineHeightPx: number, fontSize: number): string;
    /**
     * Map letter spacing to tracking class
     */
    mapLetterSpacing(letterSpacing: number): string;
    /**
     * Map text align to text-align class
     */
    mapTextAlign(align: string): string;
    /**
     * Map text decoration to class
     */
    mapTextDecoration(decoration: string): string;
    /**
     * Map text case to class
     */
    mapTextCase(textCase: string): string;
    /**
     * Map font family to class
     */
    mapFontFamily(fontFamily: string): string;
    /**
     * Infer appropriate HTML tag based on text style
     */
    inferTextTag(node: FigmaNodeDetails): string;
    /**
     * Check if text looks like a heading
     */
    isHeading(node: FigmaNodeDetails): boolean;
    /**
     * Check if text looks like a button
     */
    isButton(node: FigmaNodeDetails): boolean;
    /**
     * Get text content from a text node
     */
    getTextContent(node: FigmaNodeDetails): string;
    /**
     * Check if text should be truncated (ellipsis)
     */
    shouldTruncate(node: FigmaNodeDetails): boolean;
}
//# sourceMappingURL=typography.d.ts.map