# backend

To install dependencies:

```bash
bun install
```

or

```bash
npm install
```

To run:

```bash
bun run index.js
```

or

```bash
npm run dev
```

Run file understanding worker:

```bash
npm run worker
```

Swagger docs:

1. Start backend with `npm run dev`.
2. Open `http://localhost:8080/api-docs`.
3. Use the `Authorize` button for protected routes and provide your JWT token.

OpenAPI definition is maintained in `docs/openapi.js`.

API integration (async pipeline):

1. Upload file with `POST /api/files/upload-file`.
2. Response includes `fileId`, `jobId`, and `processingStatus`.
3. Poll status with `GET /api/files/processing-status/:jobId`.
4. When completed, metadata is stored in DynamoDB and vectors are upserted to Qdrant.

LLM provider configuration (adaptive):

The worker now supports switching providers via environment variables without code changes.

Ollama (local) example:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_LLM_MODEL=phi:latest
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
OLLAMA_EMBEDDING_DIMENSION=768
```

Gemini example:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_LLM_MODEL=gemini-3-flash-preview
GEMINI_EMBEDDING_DIMENSION=1536
```

Optional shared override:

```env
EMBEDDING_DIMENSION=768
```

Notes:

1. Keep `AI_PROVIDER=ollama` for fully local inference.
2. Switching back to Gemini only requires changing env values.
3. Ensure your Qdrant collection vector size matches the active embedding dimension.

Qdrant Cloud setup:

1. Set `QDRANT_URL` to your cloud cluster endpoint (HTTPS).
2. Set `QDRANT_API_KEY` to your Qdrant Cloud API key.
3. Local URLs (`localhost` / `127.0.0.1`) are rejected by the worker.

This project was created using `bun init` in bun v1.1.42. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
