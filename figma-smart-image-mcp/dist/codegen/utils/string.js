/**
 * String utilities for code generation
 */
/**
 * Convert a string to PascalCase (for component names)
 */
export function toPascalCase(str) {
    return str
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase())
        .replace(/\s+/g, "");
}
/**
 * Convert a string to camelCase (for prop names)
 */
export function toCamelCase(str) {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
/**
 * Convert a string to kebab-case (for CSS classes/variables)
 */
export function toKebabCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase();
}
/**
 * Sanitize a name for use as a JavaScript identifier
 */
export function sanitizeIdentifier(str) {
    // Remove invalid characters, ensure it doesn't start with a number
    let sanitized = str.replace(/[^a-zA-Z0-9_$]/g, "");
    if (/^\d/.test(sanitized)) {
        sanitized = "_" + sanitized;
    }
    return sanitized || "unnamed";
}
/**
 * Sanitize a Figma node name for use as a component name
 */
export function sanitizeComponentName(str) {
    return toPascalCase(str.replace(/\s*\(.*?\)\s*/g, "")); // Remove variant suffixes like "(Primary)"
}
/**
 * Escape a string for use in JSX text content
 */
export function escapeJSX(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}
/**
 * Escape a string for use in a JavaScript string literal
 */
export function escapeJSString(text) {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
/**
 * Dedent a template string (remove leading whitespace common to all lines)
 */
export function dedent(strings, ...values) {
    const raw = typeof strings === "string" ? [strings] : strings.raw;
    let result = "";
    for (let i = 0; i < raw.length; i++) {
        result += raw[i];
        if (i < values.length) {
            result += values[i];
        }
    }
    const lines = result.split("\n");
    if (lines.length === 0)
        return result;
    // Find the minimum indentation (excluding first/last line if empty)
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim().length > 0) {
            const indent = line.match(/^\s*/)?.[0].length ?? 0;
            minIndent = Math.min(minIndent, indent);
        }
    }
    // Remove the common indentation
    return lines
        .map((line, i) => {
        if (i === 0 || line.trim().length === 0)
            return line;
        return line.slice(minIndent);
    })
        .join("\n");
}
/**
 * Generate a string hash for caching
 */
export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}
//# sourceMappingURL=string.js.map