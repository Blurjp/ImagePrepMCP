/**
 * JSX Element Builder - converts Figma nodes to JSX elements
 */

import type { FigmaNodeDetails } from "../../figma/api.js";
import type { JSXElement, BuildContext, ExportStyle } from "../utils/types.js";
import { FigmaToTailwindMapper } from "../mappers/index.js";
import { sanitizeComponentName } from "../utils/string.js";

/**
 * Builds JSX elements from Figma nodes
 */
export class JSXElementBuilder {
  private mapper: FigmaToTailwindMapper;

  constructor(private context: BuildContext) {
    this.mapper = new FigmaToTailwindMapper(context);
  }

  /**
   * Build a JSX element from a Figma node
   */
  buildElement(node: FigmaNodeDetails, children: JSXElement[] = []): JSXElement {
    const tag = this.mapNodeTypeToTag(node);
    const classes = this.mapper.mapNodeStyles(node);
    const props = this.buildProps(node, classes);

    return {
      tag,
      props,
      children,
      textContent: node.characters,
      isSelfClosing: children.length === 0 && !node.characters,
    };
  }

  /**
   * Map Figma node type to HTML tag
   */
  private mapNodeTypeToTag(node: FigmaNodeDetails): string {
    switch (node.type) {
      case "FRAME":
      case "COMPONENT":
      case "INSTANCE":
      case "GROUP":
        return "div";

      case "TEXT":
        return this.inferTextTag(node);

      case "DOCUMENT":
      case "PAGE":
        return "div"; // Root container

      case "SECTION":
        return "section";

      case "VECTOR":
      case "STAR":
      case "POLYGON":
      case "LINE":
      case "ELLIPSE":
      case "RECTANGLE":
        return "div"; // Will have background/border

      case "IMAGE":
        return "img";

      case "SLICE":
        return "div"; // Invisible container

      default:
        return "div";
    }
  }

  /**
   * Infer semantic HTML tag for text nodes
   */
  private inferTextTag(node: FigmaNodeDetails): string {
    if (!node.style) {
      return "span";
    }

    const fontSize = node.style.fontSize || 16;
    const fontWeight = node.style.fontWeight || 400;

    // Check for heading styles
    if (fontSize >= 48) return "h1";
    if (fontSize >= 36) return "h2";
    if (fontSize >= 24) return "h3";
    if (fontSize >= 20) return "h4";
    if (fontSize >= 18) return "h5";

    // Bold text might be a button or strong
    if (fontWeight >= 600) {
      return "span"; // Let caller decide if button
    }

    // Check for list items (starting with •, -, etc.)
    if (node.characters) {
      const trimmed = node.characters.trim();
      if (/^[•\-\*]\s/.test(trimmed)) {
        return "li";
      }
    }

    // Default paragraph
    return "p";
  }

  /**
   * Build props object for the JSX element
   */
  private buildProps(node: FigmaNodeDetails, classes: string[]): Record<string, string | boolean | undefined> {
    const props: Record<string, string | boolean | undefined> = {};

    // Add CSS classes based on export style
    if (classes.length > 0) {
      if (this.context.exportStyle === "twin.macro") {
        props.tw = this.classesToTwinMacro(classes);
      } else if (this.context.exportStyle === "tw") {
        props.tw = this.classesToString(classes);
      } else {
        props.className = classes.join(" ");
      }
    }

    // Add src for images
    if (node.type === "IMAGE" && (node as any).fills?.[0]?.type === "IMAGE") {
      // We'd need to export the image separately
      // For now, use a placeholder
      props.src = "";
      props.alt = node.name || "Image";
    }

    // Add width/height for fixed-size elements
    if (node.absoluteBoundingBox && !node.layoutMode) {
      const { width, height } = node.absoluteBoundingBox;
      if (width && width > 0 && !this.hasSizeClass(classes)) {
        props.style = `width: ${width}px; height: ${height}px;`;
      }
    }

    return props;
  }

  /**
   * Convert classes to twin.macro format
   * Converts: ["flex", "p-4", "bg-blue-500"]
   * To: "flex p-4 bg-blue-500"
   */
  private classesToTwinMacro(classes: string[]): string {
    return this.classesToString(classes);
  }

  /**
   * Convert classes array to string
   */
  private classesToString(classes: string[]): string {
    return classes.join(" ");
  }

  /**
   * Check if element already has size classes
   */
  private hasSizeClass(classes: string[]): boolean {
    return classes.some((c) => /^w-|h-/.test(c));
  }

  /**
   * Generate component name from node
   */
  getComponentName(node: FigmaNodeDetails): string {
    return sanitizeComponentName(node.name);
  }

  /**
   * Generate a safe prop name from node name
   */
  getPropName(node: FigmaNodeDetails): string {
    const name = node.name.replace(/\s*\(.*?\)\s*/g, ""); // Remove variant suffixes
    return name
      .replace(/[^a-zA-Z0-9_$]/g, "")
      .replace(/^[0-9]/, "_$&")
      .toLowerCase();
  }

  /**
   * Check if node should be extracted as a prop
   */
  shouldExtractAsProp(node: FigmaNodeDetails): boolean {
    // Text content should be a prop
    if (node.type === "TEXT" && node.characters) {
      return true;
    }

    // Instances could be props (slot content)
    if (node.type === "INSTANCE") {
      return true;
    }

    // Nodes with generic names might be slots
    const genericNames = ["content", "slot", "placeholder", "icon"];
    const lowerName = node.name.toLowerCase();
    if (genericNames.some((g) => lowerName.includes(g))) {
      return true;
    }

    return false;
  }
}

/**
 * Convert a JSX element to string representation
 */
export function jsxToString(element: JSXElement, indent: number = 0): string {
  const spaces = " ".repeat(indent * 2);

  // Build props string
  const propsEntries = Object.entries(element.props);
  const propsString =
    propsEntries.length > 0
      ? " " +
        propsEntries
          .map(([key, value]) => {
            if (value === true) {
              return key;
            }
            if (typeof value === "string" && (key === "tw" || key === "className")) {
              // Use template literal for classes
              return `${key}={${JSON.stringify(value)}}`;
            }
            return `${key}={${JSON.stringify(value)}}`;
          })
          .join(" ")
      : "";

  // Self-closing tag
  if (element.isSelfClosing) {
    return `<${element.tag}${propsString} />`;
  }

  // Tag with content
  if (element.textContent) {
    return `<${element.tag}${propsString}>${element.textContent}</${element.tag}>`;
  }

  // Tag with children
  if (element.children.length > 0) {
    const children = element.children.map((child) => jsxToString(child, indent + 1));
    return `<${element.tag}${propsString}>\n${children.map((c) => spaces + "  " + c).join("\n")}\n${spaces}</${element.tag}>`;
  }

  // Empty tag (shouldn't happen)
  return `<${element.tag}${propsString}></${element.tag}>`;
}

/**
 * Format JSX for output in a React component
 */
export function formatJSXForComponent(element: JSXElement, indent: number = 2): string {
  return jsxToString(element, 0);
}
