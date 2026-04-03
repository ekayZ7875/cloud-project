import { embedText, generateAssistantText } from "./gemini.service.js";
import { searchChunksByVector, getAllChunksForFiles } from "./qdrant.service.js";

const AI_PROMPT_TEMPLATE = `You are a personal knowledge assistant. Your goal is to answer user queries based ONLY on the provided file context.

Rules:
1. Do NOT hallucinate. If the requested information is not found in the provided context, respond EXACTLY with: "⚠️ I could not find this information in your files."
2. Base your answers strictly on the provided context chunks.
3. If multiple files are involved, organize the answer file-wise.
4. Keep answers concise, structured, and helpful.
5. If the user asks for a summary, provide a 5-7 line paragraph. If it's a folder, give an overall summary and then file-wise highlights.
6. If the user asks for key points, use bullet points focusing on important insights.
7. If the user asks for deadlines/tasks, use the format: "Task | Date | File Name". Return a list of deadlines.
8. If the user asks a question, answer precisely and cite the source file names like "(Source: file_name)".
9. For cross-file insights, compare documents, find common themes, and highlight differences if asked.

Context Data (File chunks extracted from the user's files):
{{CONTEXT}}

User Query: {{QUERY}}

Response:`;

function buildPrompt(query, contexts) {
  const contextString = contexts
    .map((c) => `--- File: ${c.fileName} ---\n${c.text}`)
    .join("\n\n");
  
  return AI_PROMPT_TEMPLATE.replace("{{CONTEXT}}", contextString).replace("{{QUERY}}", query);
}

export async function generateKnowledgeAssistantResponse(query, fileIds = [], fileMappings = {}) {
  let searchResults = [];
  const lowerQuery = query.toLowerCase();
  
  // If the query is asking for a broad operation like summarization or all deadlines,
  // we might be better off getting all chunks for the specific file/folder than vector search.
  // But we still limit it to avoid context window explosion.
  const isBroadQuery = lowerQuery.includes("summarize") || lowerQuery.includes("all deadlines") || lowerQuery.includes("key topics");
  
  if (isBroadQuery && fileIds.length > 0) {
    const allChunks = await getAllChunksForFiles(fileIds);
    searchResults = allChunks.slice(0, 40); // Cap chunks to avoid rate limit or context too big
  }

  if (searchResults.length === 0) {
    // 1. Generate embedding for the user's query
    const queryVector = await embedText(query, { forceProvider: "ollama" });

    // 2. Search Qdrant for semantic matches
    searchResults = await searchChunksByVector(queryVector, fileIds, 15);
  }

  // Fallback: if semantic search misses but files were explicitly selected,
  // pull chunks directly for those files and continue with bounded context.
  if ((!searchResults || searchResults.length === 0) && fileIds.length > 0) {
    const allChunks = await getAllChunksForFiles(fileIds);
    searchResults = allChunks.slice(0, 40);
  }

  if (!searchResults || searchResults.length === 0) {
    return "⚠️ I could not find this information in your files.";
  }

  // 3. Map Qdrant results back to useful text with filenames
  const contextData = searchResults.map(result => {
    const payload = result.payload;
    const fileId = payload.fileId || "";
    const fileName = fileMappings[fileId] || `File-${fileId.substring(0, 4)}`;
    return {
      fileName,
      text: payload.text || payload.context || "",
    };
  });

  // 4. Construct LLM Prompt
  const prompt = buildPrompt(query, contextData);

  // 5. Query local Ollama for final response generation.
  return generateAssistantText(prompt, { forceProvider: "ollama" });
}
