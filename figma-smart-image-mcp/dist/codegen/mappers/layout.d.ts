/**
 * Layout mapper - Figma Auto Layout to Tailwind Flexbox classes
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
/**
 * Maps Figma layout properties to Tailwind CSS classes
 */
export declare class LayoutMapper {
    /**
     * Map Auto Layout properties to Tailwind flex classes
     */
    mapAutoLayout(node: FigmaNodeDetails): string[];
    /**
     * Map primary axis alignment (mainAxisAlignment)
     * Figma: MIN, CENTER, MAX, SPACE_BETWEEN
     * Tailwind: justify-start, justify-center, justify-end, justify-between
     */
    private mapPrimaryAxisAlign;
    /**
     * Map counter axis alignment (counterAxisAlignment)
     * Figma: MIN, CENTER, MAX
     * Tailwind: items-start, items-center, items-end
     */
    private mapCounterAxisAlign;
    /**
     * Map pixel spacing to Tailwind spacing scale
     */
    mapSpacing(pixels: number, prefix: string): string;
    /**
     * Map padding to Tailwind classes
     */
    private mapPadding;
    /**
     * Map sizing mode (primaryAxisSizingMode, counterAxisSizingMode)
     * Figma: FIXED, FILL
     * Tailwind: flex-grow, w-full, h-full
     */
    private mapSizingMode;
    /**
     * Map constraints to Tailwind classes
     * Figma constraints: SCALE, LEFT, RIGHT, TOP, BOTTOM, LEFT_RIGHT, TOP_BOTTOM, CENTER
     */
    mapConstraints(node: FigmaNodeDetails): string[];
    /**
     * Get explicit width/height from bounding box
     */
    mapDimensions(node: FigmaNodeDetails): string[];
}
//# sourceMappingURL=layout.d.ts.map