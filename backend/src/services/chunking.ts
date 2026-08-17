import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * LangChain-based text chunking for source code.
 * Splits large files into overlapping chunks optimized for embedding + retrieval.
 */

/**
 * Chunk configuration — tuned for code + documentation.
 * Smaller chunks = better granularity for RAG, but more API calls.
 */
export const CHUNK_CONFIG = {
  chunkSize: 512, // tokens, roughly 2KB for code
  chunkOverlap: 64, // overlap for context continuity
  separators: [
    "\n\nclass ", // Class definitions
    "\n\nexport ",
    "\n\nfunction ",
    "\n\nconst ",
    "\n\nlet ",
    "\n\nvar ",
    "\n\n", // Paragraph breaks
    "\n", // Line breaks
    " ", // Word boundaries
    "", // Character level (fallback)
  ],
};

/**
 * Split file content into chunks for embedding.
 * Returns array of { content, index, startChar, endChar }.
 */
export async function chunkFileContent(
  filePath: string,
  fileContent: string
): Promise<Array<{ content: string; chunkIndex: number; startChar: number; endChar: number }>> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_CONFIG.chunkSize,
    chunkOverlap: CHUNK_CONFIG.chunkOverlap,
    separators: CHUNK_CONFIG.separators,
  });

  try {
    const chunks = await splitter.splitText(fileContent);

    // Map chunks to include position information
    const chunkedWithPosition = chunks.map((content, index) => {
      // Find the position in the original content
      let currentPos = 0;
      let startChar = 0;

      for (let i = 0; i < index; i++) {
        // Rough approximation of where previous chunks ended
        currentPos += chunks[i].length + CHUNK_CONFIG.chunkOverlap;
      }

      startChar = Math.max(0, fileContent.indexOf(content, Math.max(0, currentPos - 100)));
      const endChar = Math.min(fileContent.length, startChar + content.length);

      return {
        content,
        chunkIndex: index,
        startChar,
        endChar,
      };
    });

    return chunkedWithPosition;
  } catch (error) {
    console.error(`Error chunking file ${filePath}:`, error);
    throw new Error(`Failed to chunk file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Estimate token count for a string (rough approximation).
 * LLMs typically use ~1 token per 4 characters for English text.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
