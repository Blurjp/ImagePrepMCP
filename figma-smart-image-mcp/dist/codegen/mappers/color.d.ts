/**
 * Color mapper - Figma fills to Tailwind color classes
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { FillStyle } from "../utils/types.js";
/**
 * Maps Figma fill properties to Tailwind CSS classes
 */
export declare class ColorMapper {
    private designTokens;
    constructor(designTokens?: Map<string, string>);
    /**
     * Map fill styles to background/border classes
     */
    mapFills(node: FigmaNodeDetails): string[];
    /**
     * Map a single fill to a Tailwind class
     */
    mapFill(fill: FillStyle): string | null;
    /**
     * Map solid fill to bg-{color} class
     */
    private mapSolidFill;
    /**
     * Map linear gradient to bg-gradient class
     */
    private mapLinearGradient;
    /**
     * Map radial gradient to bg-radial class
     */
    private mapRadialGradient;
    /**
     * Map stroke to border classes
     */
    mapStrokes(node: FigmaNodeDetails): string[];
    /**
     * Map stroke weight to border width class
     */
    private mapStrokeWeight;
    /**
     * Map corner radius to rounded classes
     */
    mapBorderRadius(node: FigmaNodeDetails): string[];
    /**
     * Map opacity to opacity class
     */
    mapOpacity(node: FigmaNodeDetails): string[];
    /**
     * Find a matching design token for a hex color
     */
    private findTokenMatch;
    /**
     * Convert opacity to Tailwind percentage value
     */
    private opacityValue;
    /**
     * Map text color for text nodes
     */
    mapTextColor(node: FigmaNodeDetails): string[];
}
//# sourceMappingURL=color.d.ts.map