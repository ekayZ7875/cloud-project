import { embedText, generateAssistantText } from "./gemini.service.js";
import { searchChunksByVector, getAllChunksForFiles } from "./qdrant.service.js";
import {
  AI_PROMPT_TEMPLATE,
  CONVERSATIONAL_PROMPT_TEMPLATE,
  CONVERSATIONAL_STUDY_PROMPT_TEMPLATE
} from "../prompts/ai.prompts.js";

function formatHistory(history = []) {
  if (!history || history.length === 0) return "No history yet.";
  return history
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");
}

function buildConversationalPrompt(query, contexts, history = [], studyMode = false) {
  const contextString = contexts
    .map((c) => `--- File: ${c.fileName} ---\n${c.text}`)
    .join("\n\n");
  
  const historyString = formatHistory(history);
  const template = studyMode ? CONVERSATIONAL_STUDY_PROMPT_TEMPLATE : CONVERSATIONAL_PROMPT_TEMPLATE;
  
  return template
    .replace("{{CONTEXT}}", contextString)
    .replace("{{HISTORY}}", historyString)
    .replace("{{QUERY}}", query);
}

export async function generateKnowledgeAssistantResponse(
  query,
  fileIds = [],
  fileMappings = {},
  studyMode = false,
  history = []
) {
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
    const queryVector = await embedText(query);

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
  const prompt = buildConversationalPrompt(query, contextData, history, studyMode);

  // 5. Generate final response using the active LLM provider.
  return generateAssistantText(prompt);
}
