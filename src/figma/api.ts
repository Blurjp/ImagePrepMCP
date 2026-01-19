/**
 * Figma REST API client.
 * Handles file info retrieval and image export.
 */

import { request } from "undici";

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

export class FigmaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public figmaCode?: string
  ) {
    super(message);
    this.name = "FigmaApiError";
  }
}

export class FigmaApiClient {
  private readonly baseUrl = "https://api.figma.com/v1";

  constructor(private readonly accessToken: string) {}

  /**
   * Get file information from Figma.
   */
  async getFileInfo(fileKey: string): Promise<FigmaFileInfo> {
    const url = `${this.baseUrl}/files/${fileKey}`;

    try {
      const response = await request(url, {
        headers: {
          "X-Figma-Token": this.accessToken,
        },
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text() as any;
        throw new FigmaApiError(
          body.err || `Failed to get file info (status ${response.statusCode})`,
          response.statusCode,
          body.code
        );
      }

      const data = await response.body.json() as FigmaFileInfo;
      return data;
    } catch (error) {
      if (error instanceof FigmaApiError) {
        throw error;
      }
      throw new Error(`Failed to connect to Figma API: ${error}`);
    }
  }

  /**
   * Get image export URL(s) for a specific node.
   */
  async getImageExportUrl(
    fileKey: string,
    nodeId: string,
    format: "svg" | "png"
  ): Promise<string> {
    const url = `${this.baseUrl}/images/${fileKey}?ids=${nodeId}&format=${format}&svg_outline_text=false`;

    try {
      const response = await request(url, {
        headers: {
          "X-Figma-Token": this.accessToken,
        },
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text() as any;
        throw new FigmaApiError(
          body.err || `Failed to get image export URL (status ${response.statusCode})`,
          response.statusCode,
          body.code
        );
      }

      const data = await response.body.json() as any;

      if (!data.images || !data.images[nodeId]) {
        throw new Error(`No image URL returned for node ${nodeId}`);
      }

      const imageUrl = data.images[nodeId];

      // Figma returns empty string for unsupported formats
      if (!imageUrl || imageUrl === "") {
        throw new Error(`Format ${format} is not supported for this node`);
      }

      return imageUrl;
    } catch (error) {
      if (error instanceof FigmaApiError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes("not supported")) {
        throw error;
      }
      throw new Error(`Failed to get image export URL: ${error}`);
    }
  }

  /**
   * Find the first suitable frame/node in the file.
   * Strategy: Get the first page, then find the first top-level frame.
   */
  async findFirstNode(fileKey: string): Promise<{ nodeId: string; nodeName: string }> {
    const fileInfo = await this.getFileInfo(fileKey);

    // The document structure is: document -> children (pages) -> children (frames on page)
    if (!fileInfo.document || !fileInfo.document.children) {
      throw new Error("File has no pages");
    }

    const firstPage = fileInfo.document.children[0];
    if (!firstPage || !firstPage.children) {
      throw new Error("First page has no content");
    }

    // Prefer frames over other node types
    const frames = firstPage.children.filter((node: FigmaNode) =>
      node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE"
    );

    if (frames.length > 0) {
      return {
        nodeId: frames[0].id,
        nodeName: frames[0].name,
      };
    }

    // Fallback to first node if no frames
    return {
      nodeId: firstPage.children[0].id,
      nodeName: firstPage.children[0].name,
    };
  }

  /**
   * Get node info from the file.
   */
  async getNodeInfo(fileKey: string, nodeId: string): Promise<FigmaNode> {
    const url = `${this.baseUrl}/files/${fileKey}/nodes?ids=${nodeId}`;

    try {
      const response = await request(url, {
        headers: {
          "X-Figma-Token": this.accessToken,
        },
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text() as any;
        throw new FigmaApiError(
          body.err || `Failed to get node info (status ${response.statusCode})`,
          response.statusCode,
          body.code
        );
      }

      const data = await response.body.json() as any;

      if (!data.nodes || !data.nodes[nodeId]) {
        throw new Error(`Node ${nodeId} not found`);
      }

      return data.nodes[nodeId].document as FigmaNode;
    } catch (error) {
      if (error instanceof FigmaApiError) {
        throw error;
      }
      throw new Error(`Failed to get node info: ${error}`);
    }
  }
}
