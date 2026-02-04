/**
 * React Component Generator - main orchestrator for code generation
 */

import type { FigmaApiClient } from "../../figma/api.js";
import type { FigmaLinkParser } from "../../figma/parse_link.js";
import type { FigmaVariablesResponse } from "../../figma/api.js";
import type {
  BuildContext,
  ExportStyle,
  GeneratedComponent,
  PropDefinition,
  JSXElement,
} from "../utils/types.js";
import { ComponentTreeTraverser } from "../traverser/tree.js";
import { PropsGenerator } from "./props.js";
import { VariantGenerator, VariantDefinition } from "./variants.js";
import { formatJSXForComponent } from "./jsx.js";
import { sanitizeComponentName } from "../utils/string.js";

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
    bounds?: { width: number; height: number };
  };
}

/**
 * Generates React components from Figma designs
 */
export class ReactComponentGenerator {
  constructor(
    private api: FigmaApiClient,
    private linkParser: typeof FigmaLinkParser
  ) {}

  /**
   * Main entry point - generate React component from Figma URL
   */
  async generate(input: ExportInput): Promise<ExportOutput> {
    // Parse Figma URL
    const parsed = this.linkParser.parse(input.url);

    if (!parsed.nodeId) {
      throw new Error("URL must include a node-id parameter");
    }

    // Create build context
    const context: BuildContext = {
      designTokens: new Map(),
      componentMap: new Map(),
      exportStyle: input.exportStyle || "twin.macro",
      includeTypescript: input.includeTypescript ?? true,
      extractProps: input.extractProps ?? true,
    };

    // Extract design tokens if requested
    if (input.extractDesignTokens) {
      context.designTokens = await this.extractDesignTokens(parsed.fileKey);
    }

    // Traverse and build component tree
    const traverser = new ComponentTreeTraverser(this.api, context);
    const { rootElement, elements, nodes } = await traverser.traverse(parsed.fileKey, parsed.nodeId);

    const rootNode = nodes.get(parsed.nodeId);
    if (!rootNode) {
      throw new Error("Failed to get root node details");
    }

    // Determine component name
    const componentName = input.componentName || sanitizeComponentName(rootNode.name);

    // Check if this is a component set (has variants)
    const variantGenerator = new VariantGenerator(context);
    const isComponentSet = variantGenerator.isComponentSet(rootNode);
    let variants: VariantDefinition | null = null;

    // Extract props and variants
    let props: PropDefinition[] = [];
    let propsInterface: string | null = null;
    let propsDestructuring = "";

    if (input.extractProps) {
      if (isComponentSet) {
        // Extract variants from component set (using cached nodes!)
        variants = variantGenerator.extractVariants(rootNode, (nodeId) => {
          return traverser.getCachedNode(nodeId);
        });

        if (variants) {
          propsInterface = variantGenerator.generateVariantInterface(componentName, variants, context.includeTypescript);
          const interfaceName = context.includeTypescript ? `${componentName}Props` : null;
          propsDestructuring = variantGenerator.generateVariantDestructuring(variants, interfaceName);

          // Create prop definitions from variants
          for (const prop of variants.properties) {
            props.push({
              name: prop.name,
              type: prop.values.map((v) => `"${v}"`).join(" | "),
              defaultValue: prop.defaultValue,
              isRequired: true,
            });
          }
        }
      }

      // If no variants or not a component set, use regular props extraction
      if (!variants) {
        const propsGenerator = new PropsGenerator(context);
        props = propsGenerator.extractProps(rootNode, elements);
        propsInterface = propsGenerator.generateInterface(componentName, props, context.includeTypescript);
        const interfaceName = context.includeTypescript ? `${componentName}Props` : null;
        propsDestructuring = propsGenerator.generateDestructuring(props, interfaceName);
      }

      // Always add children prop for slots
      if (props.length === 0 || !props.some(p => p.name === "children")) {
        props.push({
          name: "children",
          type: "React.ReactNode",
          isRequired: false,
        });
      }
    }

    // Format JSX for component
    const jsxCode = formatJSXForComponent(rootElement);

    // Generate component code
    const code = this.generateComponentCode(
      componentName,
      jsxCode,
      propsDestructuring,
      propsInterface,
      context.exportStyle,
      context.includeTypescript,
      variants
    );

    // Get dependencies
    const dependencies = this.getDependencies(context.exportStyle);

    // Build metadata
    const metadata = {
      figmaFileKey: parsed.fileKey,
      figmaNodeId: parsed.nodeId,
      figmaNodeName: rootNode.name,
      componentName,
      bounds: rootNode.absoluteBoundingBox
        ? {
            width: rootNode.absoluteBoundingBox.width,
            height: rootNode.absoluteBoundingBox.height,
          }
        : undefined,
    };

    // Build design tokens output
    let designTokensOutput;
    if (input.extractDesignTokens && context.designTokens.size > 0) {
      designTokensOutput = this.formatDesignTokens(context.designTokens);
    }

    return {
      component: {
        name: componentName,
        code,
        language: context.includeTypescript ? "typescript" : "javascript",
        props,
      },
      designTokens: designTokensOutput,
      dependencies,
      metadata,
    };
  }

  /**
   * Extract design tokens from Figma variables
   */
  private async extractDesignTokens(fileKey: string): Promise<Map<string, string>> {
    const tokens = new Map<string, string>();

    try {
      const variablesData = await this.api.getVariables(fileKey);
      const { variables, variableCollections } = variablesData.meta;

      // Get the first mode ID from each collection (usually the default/light mode)
      const defaultModeIds = new Map<string, string>();
      for (const [collectionId, collection] of Object.entries(variableCollections || {})) {
        if (collection.modes && collection.modes.length > 0) {
          defaultModeIds.set(collectionId, collection.modes[0].modeId);
        }
      }

      for (const [id, variable] of Object.entries(variables || {})) {
        // Get the value for the first mode (default)
        const modeEntries = Object.entries(variable.valuesByMode);
        if (modeEntries.length > 0) {
          // Get first available mode value
          const [modeId, value] = modeEntries[0];
          if (value && value.type !== "VARIABLE_ALIAS") {
            const tokenName = this.variableNameToCss(variable.name, variable.resolvedType);
            const cssValue = this.variableValueToCss(value, variable.resolvedType);
            tokens.set(tokenName, cssValue);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to extract design tokens:", error);
      // Continue without tokens
    }

    return tokens;
  }

  /**
   * Convert Figma variable name to CSS variable name with semantic prefixes
   */
  private variableNameToCss(name: string, type: string): string {
    // Convert camelCase/PascalCase to kebab-case
    let kebabName = name
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[_\s]+/g, "-")
      .toLowerCase();

    // Add semantic prefix based on type
    const prefix = this.getTypePrefix(type);
    return `${prefix}-${kebabName}`.replace(/^-+/, "");
  }

  /**
   * Get semantic prefix for variable type
   */
  private getTypePrefix(type: string): string {
    switch (type) {
      case "COLOR":
        return "color";
      case "FLOAT":
        return "spacing";
      case "STRING":
        return "string";
      case "BOOLEAN":
        return "bool";
      default:
        return "token";
    }
  }

  /**
   * Convert Figma variable value to CSS value
   */
  private variableValueToCss(value: any, type: string): string {
    switch (type) {
      case "COLOR":
        if (value.type === "VARIABLE_ALIAS") {
          return `var(--${this.variableNameToCss(value.id, "COLOR")})`;
        }
        // RGB color - convert to hex for CSS
        if (value.r !== undefined) {
          const r = Math.round(value.r * 255);
          const g = Math.round(value.g * 255);
          const b = Math.round(value.b * 255);
          const a = value.a !== undefined ? value.a : 1;
          if (a < 1) {
            return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2).replace(/\.?0+$/, "")})`;
          }
          const toHex = (n: number) => n.toString(16).padStart(2, "0");
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
        return JSON.stringify(value);

      case "FLOAT":
        return typeof value === "number" ? `${Math.round(value * 100) / 100}px` : JSON.stringify(value);

      case "STRING":
        return typeof value === "string" ? `"${value}"` : JSON.stringify(value);

      default:
        return JSON.stringify(value);
    }
  }

  /**
   * Format design tokens for output
   */
  private formatDesignTokens(tokens: Map<string, string>): {
    tailwindConfig?: Record<string, any>;
    cssVariables?: string;
  } {
    if (tokens.size === 0) {
      return {};
    }

    // CSS custom properties - grouped by category
    const cssVars: string[] = [":root {"];
    const groupedTokens: Map<string, Array<{ name: string; value: string }>> = new Map();

    for (const [name, value] of tokens.entries()) {
      const parts = name.split("-");
      const category = parts[0] || "other";

      if (!groupedTokens.has(category)) {
        groupedTokens.set(category, []);
      }
      groupedTokens.get(category)!.push({ name, value });
    }

    // Sort by category and add comments
    const categories = Array.from(groupedTokens.keys()).sort();
    for (const category of categories) {
      const vars = groupedTokens.get(category)!;
      if (vars.length > 0) {
        cssVars.push(`  /* ${category.charAt(0).toUpperCase() + category.slice(1)} */`);
        vars.sort((a, b) => a.name.localeCompare(b.name));
        for (const { name, value } of vars) {
          cssVars.push(`  --${name}: ${value};`);
        }
      }
    }
    cssVars.push("}");

    // Tailwind config extension - structured by category
    const tailwindConfig: Record<string, any> = {
      theme: {
        extend: {},
      },
    };

    // Organize into semantic groups
    const colors: Record<string, string> = {};
    const spacing: Record<string, string> = {};
    const fontSize: Record<string, string> = {};
    const fontFamily: Record<string, string> = {};
    const fontWeight: Record<string, string> = {};
    const lineHeight: Record<string, string> = {};

    for (const [name, value] of tokens.entries()) {
      const parts = name.split("-");
      const category = parts[0];
      const subcategory = parts.slice(1).join("-");

      switch (category) {
        case "color":
          // Group colors by semantic name
          colors[subcategory] = `var(--${name})`;
          break;

        case "spacing":
          spacing[subcategory] = `var(--${name})`;
          break;

        case "string":
          // Could be font family or other string tokens
          if (subcategory.includes("font") || subcategory.includes("family")) {
            fontFamily[subcategory.replace(/font-?|family-?/g, "")] = value.replace(/"/g, "");
          }
          break;

        default:
          // Try to infer type from value
          if (value.endsWith("px")) {
            spacing[subcategory] = `var(--${name})`;
          }
          break;
      }
    }

    const extend: any = {};
    if (Object.keys(colors).length > 0) extend.colors = colors;
    if (Object.keys(spacing).length > 0) extend.spacing = spacing;
    if (Object.keys(fontSize).length > 0) extend.fontSize = fontSize;
    if (Object.keys(fontFamily).length > 0) extend.fontFamily = fontFamily;
    if (Object.keys(fontWeight).length > 0) extend.fontWeight = fontWeight;
    if (Object.keys(lineHeight).length > 0) extend.lineHeight = lineHeight;

    if (Object.keys(extend).length > 0) {
      tailwindConfig.theme.extend = extend;
    }

    return {
      tailwindConfig: Object.keys(tailwindConfig.theme.extend).length > 0 ? tailwindConfig : undefined,
      cssVariables: cssVars.join("\n"),
    };
  }

  /**
   * Generate the final component code
   */
  private generateComponentCode(
    componentName: string,
    jsxCode: string,
    propsDestructuring: string,
    propsInterface: string | null,
    exportStyle: ExportStyle,
    includeTypescript: boolean,
    variants?: VariantDefinition | null
  ): string {
    const lines: string[] = [];

    // Imports
    if (exportStyle === "twin.macro") {
      lines.push(`import { tw } from "twin.macro"`);
    }
    lines.push(includeTypescript ? `import type { ReactNode } from "react"` : "");
    lines.push("");

    // Props interface
    if (propsInterface) {
      lines.push(propsInterface);
      lines.push("");
    }

    // Component function
    const componentParams = propsDestructuring || "";
    lines.push(`export function ${componentName}(${componentParams}) {`);

    // If variants exist, add a comment about variant handling
    if (variants && variants.properties.length > 0) {
      lines.push(`  // Component with ${variants.properties.length} variant${variants.properties.length > 1 ? 's' : ''}: ${variants.properties.map(p => p.name).join(", ")}`);
      lines.push(`  // To implement variants, analyze each instance and apply variant-specific classes`);
    }

    // Component body
    lines.push(`  return (`);
    lines.push(`    ${this.indentCode(jsxCode, 4)}`);
    lines.push(`  );`);
    lines.push("}");

    return lines.filter((line) => line !== "").join("\n");
  }

  /**
   * Indent code by specified number of spaces
   */
  private indentCode(code: string, spaces: number): string {
    const indent = " ".repeat(spaces);
    return code
      .split("\n")
      .map((line) => indent + line)
      .join("\n");
  }

  /**
   * Get required dependencies for the generated code
   */
  private getDependencies(exportStyle: ExportStyle): string[] {
    const deps: string[] = [];

    if (exportStyle === "twin.macro") {
      deps.push("twin.macro");
    }

    return deps;
  }
}
