# How to Make Your MCP Server Match Official Figma MCP

## Current State
- ✅ You ALREADY call Figma Files API (`getFileInfo()`)
- ✅ Files API returns components, styles, document structure
- ❌ You only use it to find first frame
- ❌ You ignore 99% of the data it returns

## What Official Figma MCP Provides
1. **Components** - definitions, properties, variants
2. **Variables** - colors, numbers, strings, booleans
3. **Styles** - text styles, color styles, effect styles, grid styles
4. **Layout data** - constraints, auto-layout, positioning
5. **Design tokens** - exported from variables/styles

---

## Implementation Steps

### STEP 1: Extract Components from Existing Data

**File**: `src/figma/api.ts`

Add new method (data is ALREADY in your `getFileInfo()` response):

```typescript
/**
 * Get all components from the file
 */
async getComponents(fileKey: string): Promise<FigmaComponentInfo[]> {
  const fileInfo = await this.getFileInfo(fileKey);

  const components: FigmaComponentInfo[] = [];

  // Components are at top level
  if (fileInfo.components) {
    for (const [key, comp] of Object.entries(fileInfo.components)) {
      components.push({
        key: key,
        name: comp.name,
        description: comp.description || '',
        componentSetId: comp.componentSetId,
        documentationLinks: comp.documentationLinks || []
      });
    }
  }

  return components;
}

/**
 * Get component sets (variants)
 */
async getComponentSets(fileKey: string): Promise<FigmaComponentSet[]> {
  const fileInfo = await this.getFileInfo(fileKey);

  const componentSets: FigmaComponentSet[] = [];

  if (fileInfo.componentSets) {
    for (const [key, compSet] of Object.entries(fileInfo.componentSets)) {
      componentSets.push({
        key: key,
        name: compSet.name,
        description: compSet.description || ''
      });
    }
  }

  return componentSets;
}
```

### STEP 2: Extract Node Properties (Layout Data)

Add method to extract detailed node information:

```typescript
/**
 * Get detailed node properties including layout, fills, effects
 */
async getNodeDetails(fileKey: string, nodeId: string): Promise<FigmaNodeDetails> {
  const fileInfo = await this.getFileInfo(fileKey);

  // Traverse document tree to find the node
  const node = this.findNodeInTree(fileInfo.document, nodeId);

  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,

    // Layout
    absoluteBoundingBox: node.absoluteBoundingBox,
    constraints: node.constraints,
    layoutMode: node.layoutMode,  // AUTO-LAYOUT
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    itemSpacing: node.itemSpacing,

    // Visual
    fills: node.fills || [],
    strokes: node.strokes || [],
    effects: node.effects || [],
    opacity: node.opacity,
    blendMode: node.blendMode,

    // Text (if text node)
    characters: node.characters,
    style: node.style,

    // Children
    children: node.children?.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type
    }))
  };
}

private findNodeInTree(node: any, targetId: string): any {
  if (node.id === targetId) {
    return node;
  }

  if (node.children) {
    for (const child of node.children) {
      const found = this.findNodeInTree(child, targetId);
      if (found) return found;
    }
  }

  return null;
}
```

### STEP 3: Add Variables API Call (NEW API ENDPOINT)

This requires a SEPARATE API call:

```typescript
/**
 * Get local variables from the file
 * NOTE: This requires a different API endpoint than getFileInfo()
 */
async getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
  const url = `${this.baseUrl}/files/${fileKey}/variables/local`;

  try {
    const response = await request(url, {
      headers: {
        "X-Figma-Token": this.accessToken,
      },
    });

    if (response.statusCode !== 200) {
      throw new FigmaApiError(
        `Failed to get variables (status ${response.statusCode})`,
        response.statusCode
      );
    }

    const data = await response.body.json();
    return data;
  } catch (error) {
    if (error instanceof FigmaApiError) {
      throw error;
    }
    throw new Error(`Failed to get variables: ${error}`);
  }
}
```

### STEP 4: Add MCP Tools to Expose This Data

**File**: `src/server.ts`

Add new tools alongside your existing `process_figma_link`:

```typescript
// Tool 1: Get Components
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ... existing process_figma_link tool ...

    {
      name: "get_figma_components",
      description: "Get all components from a Figma file for code generation",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Figma file URL"
          }
        },
        required: ["url"]
      }
    },

    {
      name: "get_figma_node_details",
      description: "Get detailed layout and styling info for a specific node",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Figma file URL with node-id"
          }
        },
        required: ["url"]
      }
    },

    {
      name: "get_figma_variables",
      description: "Get design variables (colors, spacing, etc.) from Figma file",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Figma file URL"
          }
        },
        required: ["url"]
      }
    }
  ]
}));

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_figma_components") {
    const url = String(request.params.arguments?.url);
    const parsed = FigmaLinkParser.parse(url);
    const token = await getTokenForSession(sessionId);
    const api = new FigmaApiClient(token);

    const components = await api.getComponents(parsed.fileKey);
    const componentSets = await api.getComponentSets(parsed.fileKey);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          components,
          componentSets
        }, null, 2)
      }]
    };
  }

  if (request.params.name === "get_figma_node_details") {
    const url = String(request.params.arguments?.url);
    const parsed = FigmaLinkParser.parse(url);

    if (!parsed.nodeId) {
      throw new Error("Node ID required for this tool");
    }

    const token = await getTokenForSession(sessionId);
    const api = new FigmaApiClient(token);

    const details = await api.getNodeDetails(parsed.fileKey, parsed.nodeId);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(details, null, 2)
      }]
    };
  }

  if (request.params.name === "get_figma_variables") {
    const url = String(request.params.arguments?.url);
    const parsed = FigmaLinkParser.parse(url);
    const token = await getTokenForSession(sessionId);
    const api = new FigmaApiClient(token);

    const variables = await api.getVariables(parsed.fileKey);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(variables, null, 2)
      }]
    };
  }

  // ... existing process_figma_link handler ...
});
```

---

## Type Definitions Needed

Add these interfaces to `src/figma/api.ts`:

```typescript
export interface FigmaComponentInfo {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks: string[];
}

export interface FigmaComponentSet {
  key: string;
  name: string;
  description: string;
}

export interface FigmaNodeDetails {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  constraints?: any;
  layoutMode?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  fills?: any[];
  strokes?: any[];
  effects?: any[];
  opacity?: number;
  blendMode?: string;
  characters?: string;
  style?: any;
  children?: Array<{ id: string; name: string; type: string }>;
}

export interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, {
      id: string;
      name: string;
      resolvedType: string;  // COLOR, FLOAT, STRING, BOOLEAN
      valuesByMode: Record<string, any>;
    }>;
    variableCollections: Record<string, {
      id: string;
      name: string;
      modes: Array<{ modeId: string; name: string }>;
    }>;
  };
}
```

---

## Summary: The Key Insight

**You don't need to change your API calls** - `getFileInfo()` already returns most of this data!

You just need to:
1. ✅ **Stop throwing away the data** from `getFileInfo()`
2. ✅ **Extract components, styles, properties** from the response
3. ✅ **Add one new API call** for variables (`/files/{key}/variables/local`)
4. ✅ **Create new MCP tools** to expose this data to Claude

The difference between your approach and official MCP is:
- **Yours**: Extract images for vision → ✅ Perfect for visual analysis
- **Official**: Extract structure/metadata → ✅ Perfect for code generation
- **Combined**: Do BOTH! → ✅✅ Best of both worlds

You can have BOTH image export AND component extraction running in the same server!
