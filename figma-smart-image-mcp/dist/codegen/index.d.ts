/**
 * Codegen module - exports for React + Tailwind component generation
 */
export { ReactComponentGenerator } from "./generators/component.js";
export { ComponentTreeTraverser } from "./traverser/tree.js";
export { PropsGenerator } from "./generators/props.js";
export { VariantGenerator } from "./generators/variants.js";
export { JSXElementBuilder, jsxToString, formatJSXForComponent } from "./generators/jsx.js";
export { FigmaToTailwindMapper } from "./mappers/index.js";
export { LayoutMapper } from "./mappers/layout.js";
export { ColorMapper } from "./mappers/color.js";
export { TypographyMapper } from "./mappers/typography.js";
export * from "./utils/types.js";
export { toPascalCase, toCamelCase, toKebabCase, sanitizeIdentifier, sanitizeComponentName } from "./utils/string.js";
export { rgbaToHex, rgbaToCss, hexToRgba, findClosestTailwindColor } from "./utils/color.js";
export type { ExportInput, ExportOutput } from "./generators/component.js";
export type { VariantDefinition, VariantProperty } from "./generators/variants.js";
//# sourceMappingURL=index.d.ts.map