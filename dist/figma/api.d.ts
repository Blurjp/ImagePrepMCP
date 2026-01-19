/**
 * Figma REST API client.
 * Handles file info retrieval and image export.
 */
export interface FigmaFileInfo {
    name: string;
    document: any;
    components?: Record<string, any>;
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
export declare class FigmaApiError extends Error {
    statusCode: number;
    figmaCode?: string | undefined;
    constructor(message: string, statusCode: number, figmaCode?: string | undefined);
}
export declare class FigmaApiClient {
    private readonly accessToken;
    private readonly baseUrl;
    constructor(accessToken: string);
    /**
     * Get file information from Figma.
     */
    getFileInfo(fileKey: string): Promise<FigmaFileInfo>;
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
}
//# sourceMappingURL=api.d.ts.map