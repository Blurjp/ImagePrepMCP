/**
 * String utilities for code generation
 */
/**
 * Convert a string to PascalCase (for component names)
 */
export declare function toPascalCase(str: string): string;
/**
 * Convert a string to camelCase (for prop names)
 */
export declare function toCamelCase(str: string): string;
/**
 * Convert a string to kebab-case (for CSS classes/variables)
 */
export declare function toKebabCase(str: string): string;
/**
 * Sanitize a name for use as a JavaScript identifier
 */
export declare function sanitizeIdentifier(str: string): string;
/**
 * Sanitize a Figma node name for use as a component name
 */
export declare function sanitizeComponentName(str: string): string;
/**
 * Escape a string for use in JSX text content
 */
export declare function escapeJSX(text: string): string;
/**
 * Escape a string for use in a JavaScript string literal
 */
export declare function escapeJSString(text: string): string;
/**
 * Dedent a template string (remove leading whitespace common to all lines)
 */
export declare function dedent(strings: TemplateStringsArray, ...values: any[]): string;
/**
 * Generate a string hash for caching
 */
export declare function hashString(str: string): string;
//# sourceMappingURL=string.d.ts.map