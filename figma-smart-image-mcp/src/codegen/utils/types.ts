/**
 * Shared types for React code generation
 */

import type { FigmaNodeDetails } from "../../figma/api.js";

/**
 * Export style for CSS classes
 */
export type ExportStyle = "twin.macro" | "tw" | "classnames";

/**
 * JSX element representation
 */
export interface JSXElement {
  tag: string;
  props: Record<string, string | number | boolean | undefined>;
  children: JSXElement[];
  textContent?: string;
  isSelfClosing: boolean;
}

/**
 * Build context passed through the generation pipeline
 */
export interface BuildContext {
  /** Design token name -> CSS value mapping */
  designTokens: Map<string, string>;
  /** Component name -> node ID mapping (for instances) */
  componentMap: Map<string, string>;
  /** Current export style */
  exportStyle: ExportStyle;
  /** Include TypeScript types */
  includeTypescript: boolean;
  /** Extract dynamic content as props */
  extractProps: boolean;
}

/**
 * Prop definition for component interface
 */
export interface PropDefinition {
  name: string;
  type: string;
  defaultValue?: string | number | boolean;
  isRequired: boolean;
}

/**
 * Generated component output
 */
export interface GeneratedComponent {
  name: string;
  code: string;
  language: "typescript" | "javascript";
  props: PropDefinition[];
}

/**
 * Color representation (RGBA 0-1 range)
 */
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Fill style from Figma
 */
export interface FillStyle {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "IMAGE" | "VIDEO";
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  color?: Color;
  gradientHandlePositions?: any[];
  gradientStops?: any[];
}

/**
 * Extended node details with additional computed properties
 */
export interface ExtendedNodeDetails extends FigmaNodeDetails {
  /** Computed Tailwind classes */
  tailwindClasses?: string[];
  /** Child nodes with full details (if fetched) */
  childrenDetails?: ExtendedNodeDetails[];
  /** Parent node ID (for tree traversal) */
  parentId?: string;
}
