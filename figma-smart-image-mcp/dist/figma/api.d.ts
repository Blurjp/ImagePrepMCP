/**
 * Figma REST API client.
 * Handles file info retrieval and image export.
 */
export interface FigmaFileInfo {
    name: string;
    document: any;
    components?: Record<string, any>;
    componentSets?: Record<string, any>;
}
export interface FigmaNode {
    id: string;
    name: string;
    type: string;
    children?: FigmaNode[];
    absoluteBoundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export interface ImageExportResult {
    imageUrl: string;
    format: "svg" | "png";
}
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
    absoluteBoundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
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
    children?: Array<{
        id: string;
        name: string;
        type: string;
    }>;
}
export interface FigmaVariable {
    id: string;
    name: string;
    resolvedType: string;
    valuesByMode: Record<string, any>;
    description?: string;
}
export interface FigmaVariableCollection {
    id: string;
    name: string;
    modes: Array<{
        modeId: string;
        name: string;
    }>;
}
export interface FigmaVariablesResponse {
    meta: {
        variables: Record<string, FigmaVariable>;
        variableCollections: Record<string, FigmaVariableCollection>;
    };
}
export declare class FigmaApiError extends Error {
    statusCode: number;
    figmaCode?: string | undefined;
    constructor(message: string, statusCode: number, figmaCode?: string | undefined);
}
export declare class FigmaApiClient {
    private readonly accessToken;
    private readonly requestTimeoutMs;
    private readonly baseUrl;
    constructor(accessToken: string, requestTimeoutMs?: number);
    private buildAuthHeaders;
    private requestWithTimeout;
    private parseErrorBody;
    /**
     * Get file information from Figma.
     */
    getFileInfo(fileKey: string): Promise<FigmaFileInfo>;
    /**
     * Get current user info (token identity).
     */
    getMe(): Promise<any>;
    /**
     * Check access to a file without loading full document.
     */
    checkFileAccess(fileKey: string): Promise<{
        statusCode: number;
        error?: string;
        code?: string;
    }>;
    /**
     * Get image export URL(s) for a specific node.
     */
    getImageExportUrl(fileKey: string, nodeId: string, format: "svg" | "png"): Promise<string>;
    /**
     * Find the first suitable frame/node in the file.
     * Strategy: Get the first page, then find the first top-level frame.
     */
    findFirstNode(fileKey: string): Promise<{
        nodeId: string;
        nodeName: string;
    }>;
    /**
     * Get node info from the file.
     */
    getNodeInfo(fileKey: string, nodeId: string): Promise<FigmaNode>;
    /**
     * List top-level frames (depth=2) for quick node selection.
     */
    listTopLevelFrames(fileKey: string): Promise<Array<{
        pageId: string;
        pageName: string;
        id: string;
        name: string;
        type: string;
    }>>;
    /**
     * Get all components from the file
     */
    getComponents(fileKey: string): Promise<FigmaComponentInfo[]>;
    /**
     * Get component sets (variants) from the file
     */
    getComponentSets(fileKey: string): Promise<FigmaComponentSet[]>;
    /**
     * Get detailed node properties including layout, fills, effects
     */
    getNodeDetails(fileKey: string, nodeId: string): Promise<FigmaNodeDetails>;
    /**
     * Helper method to find a node in the document tree by ID
     */
    private findNodeInTree;
    /**
     * Get local variables from the file
     * NOTE: This requires a different API endpoint than getFileInfo()
     */
    getVariables(fileKey: string): Promise<FigmaVariablesResponse>;
}
//# sourceMappingURL=api.d.ts.map