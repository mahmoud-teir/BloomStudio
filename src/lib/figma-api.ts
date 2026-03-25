import axios from 'axios';

/**
 * Base functions to call Figma API from the server-side.
 * This prevents exposing the FIGMA_PAT to the client.
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1';

/**
 * Helper to get the Figma Token from environment
 */
function getHeaders() {
  const token = process.env.FIGMA_PAT;
  if (!token) {
    throw new Error('FIGMA_PAT environment variable is not defined.');
  }
  return {
    'X-Figma-Token': token,
  };
}

/**
 * Fetch a Figma file's document tree
 */
export async function getFigmaFile(fileKey: string, nodeId?: string) {
  // Figma URLs use "0-1" format but the API requires "0:1" (colon)
  const apiNodeId = nodeId?.replace(/-/g, ':');
  const endpoint = apiNodeId
    ? `${FIGMA_API_BASE}/files/${fileKey}/nodes`
    : `${FIGMA_API_BASE}/files/${fileKey}`;
  const url = new URL(endpoint);
  if (apiNodeId) {
    url.searchParams.append('ids', apiNodeId);
  }

  try {
    const res = await axios.get(url.toString(), { 
      headers: getHeaders(), 
      timeout: 30000 
    });
    return res.data;
  } catch (error: any) {
    throw new Error(`Figma API error: ${error.message} - ${error.response?.data?.err || ''}`);
  }
}

/**
 * Fetch image nodes (e.g. SVG exports)
 */
export async function getFigmaImages(fileKey: string, nodeIds: string[], format: 'svg' | 'png' | 'jpg' = 'svg', scale = 1) {
  const url = new URL(`${FIGMA_API_BASE}/images/${fileKey}`);
  url.searchParams.append('ids', nodeIds.join(','));
  url.searchParams.append('format', format);
  url.searchParams.append('scale', scale.toString());

  try {
    const res = await axios.get(url.toString(), { 
      headers: getHeaders(), 
      timeout: 30000 
    });
    return res.data;
  } catch (error: any) {
    throw new Error(`Figma API error: ${error.message}`);
  }
}
