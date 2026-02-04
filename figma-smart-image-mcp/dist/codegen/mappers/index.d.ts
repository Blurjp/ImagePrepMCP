/**
 * Mapper orchestration - combines all mappers to convert Figma nodes to Tailwind classes
 */
import type { FigmaNodeDetails } from "../../figma/api.js";
import type { BuildContext } from "../utils/types.js";
import { LayoutMapper } from "./layout.js";
import { ColorMapper } from "./color.js";
import { TypographyMapper } from "./typography.js";
/**
 * Main mapper class that orchestrates all individual mappers
 */
export declare class FigmaToTailwindMapper {
    private layout;
    private color;
    private typography;
    constructor(context: BuildContext);
    /**
     * Map all styles from a Figma node to Tailwind classes
     */
    mapNodeStyles(node: FigmaNodeDetails): string[];
    /**
     * Get the layout mapper for specialized operations
     */
    getLayoutMapper(): LayoutMapper;
    /**
     * Get the color mapper for specialized operations
     */
    getColorMapper(): ColorMapper;
    /**
     * Get the typography mapper for specialized operations
     */
    getTypographyMapper(): TypographyMapper;
}
//# sourceMappingURL=index.d.ts.map