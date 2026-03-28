# Integration Guide for UI Agent

This document is for another agent responsible for building the frontend UI for all backend APIs in this project.

## Objective

Build production-ready UI flows in `frontend/` that cover every API in `backend/`.

## Project Context

- Backend base URL (local): `http://localhost:8080`
- API prefix: `/api`
- Auth type: Bearer JWT (except signup/login)
- OpenAPI source: `backend/docs/openapi.js`

## Existing Frontend Structure

- Entry: `frontend/src/main.jsx`
- Routes: `frontend/src/routes/index.jsx`
- Pages: `frontend/src/pages/`
- Components: `frontend/src/components/`
- Store: `frontend/src/store/`
- Service layer placeholder: `frontend/src/services/`

## API Coverage Matrix

### Auth APIs

1. `POST /api/auth/google-signup`
- Purpose: sign up or sign in with Google UID
- Body: `{ uid, email, name, avatar? }`
- UI: signup/login screen
- Public endpoint: Yes

2. `POST /api/auth/google-login`
- Purpose: login by email + Google UID
- Body: `{ email, uid }`
- UI: login screen
- Public endpoint: Yes

### File APIs

3. `POST /api/files/upload-file`
- Purpose: upload file and enqueue processing
- Body: `multipart/form-data` with `file`
- UI: upload panel + progress + status chip
- Auth required: Yes

4. `GET /api/files/get-files`
- Purpose: list user files
- UI: main file list/table
- Auth required: Yes

5. `GET /api/files/get-file?fileId=...`
- Purpose: fetch one file
- UI: file details drawer/modal
- Auth required: Yes

6. `POST /api/files/delete-files?fileId=...`
- Purpose: soft delete (move to trash)
- UI: delete action from file row/card
- Auth required: Yes

7. `POST /api/files/star-file`
- Purpose: toggle star
- Body: `{ fileId, isStarred }`
- UI: star toggle button
- Auth required: Yes

8. `GET /api/files/get-starred-files`
- Purpose: list starred files
- UI: starred tab/filter
- Auth required: Yes

9. `GET /api/files/get-trashed-files`
- Purpose: list trashed files
- UI: trash tab/page
- Auth required: Yes

10. `GET /api/files/get-recent-files`
- Purpose: list recent uploads
- UI: recent section/widget
- Auth required: Yes

11. `POST /api/files/download-file?fileId=...`
- Purpose: get signed download URL
- UI: download action
- Auth required: Yes

12. `GET /api/files/processing-status/{jobId}`
- Purpose: get processing job status
- UI: processing indicator and polling result
- Auth required: Yes
- Summarization output: final job payload can include `analysis.summary`, `analysis.entities`, `analysis.tags`, and `analysis.metadata`

### Folder APIs

13. `POST /api/folder/create-folder`
- Purpose: create folder
- Body: `{ name, parentFolderId? }`
- UI: create folder modal
- Auth required: Yes

14. `POST /api/folder/move-file-to-folder?fileId=...`
- Purpose: move single file
- Body: `{ targetFolderId }`
- UI: move action modal/dropdown
- Auth required: Yes

15. `POST /api/folder/bulk-move-files`
- Purpose: move multiple files
- Body: `{ fileIds: string[], targetFolderId }`
- UI: bulk select + move action
- Auth required: Yes

16. `GET /api/folder/get-files?folderId=...`
- Purpose: list files in folder
- UI: folder detail view
- Auth required: Yes

17. `GET /api/folder/get-all-folders`
- Purpose: fetch all folders
- UI: folder tree/sidebar/dropdowns
- Auth required: Yes

## UI Pages and Flows to Implement

1. Auth page
- Google signup/login form
- Persist JWT and user data in store/local storage
- Redirect authenticated users to home

2. Home dashboard
- Tabs or segmented views: All, Starred, Recent, Trash
- Integrated upload widget
- File list with row actions: star, delete, move, download, view details

3. Folder management
- Folder sidebar/tree
- Create folder modal
- Folder detail list
- Move single and bulk files

4. File processing feedback
- After upload, show `jobId` and initial status
- Poll `GET /api/files/processing-status/{jobId}` until terminal state
- Show success/failure state and retry affordance if applicable

5. File summarization experience
- For completed jobs, render a Summary panel using `job.analysis.summary`
- Render extracted entities list from `job.analysis.entities` when available
- Render tags/chips from `job.analysis.tags`
- Render metadata fields (for example `document_type`) from `job.analysis.metadata`
- If analysis is missing, show a graceful "Summary not available yet" empty state

## Implementation Rules for the UI Agent

1. Create a dedicated API client module
- Add `frontend/src/services/apiClient.js`
- Handle base URL, auth header injection, and common error normalization

2. Split service files by domain
- `frontend/src/services/auth.service.js`
- `frontend/src/services/file.service.js`
- `frontend/src/services/folder.service.js`

3. Keep API contracts explicit
- Export one function per endpoint
- Use stable input/output shape mapping (adapt backend payloads before UI usage)

4. Centralize auth state
- Keep JWT token in store
- Attach `Authorization: Bearer <token>` for protected endpoints
- On 401, clear session and redirect to login

5. Add loading/error/empty states everywhere
- Each list and action should include pending, success, and failure UI

6. Use optimistic updates carefully
- Good candidates: star toggle
- Avoid optimistic delete/move unless rollback behavior exists

7. Polling strategy for processing status
- Poll every 2 to 3 seconds
- Stop on terminal states like `COMPLETED` or `FAILED`
- Stop polling on unmount/navigation

8. Summary rendering and fallback rules
- Treat summary and entities as nullable and defensive-read nested fields
- Do not assume fixed metadata keys; render key-value rows dynamically
- Truncate long summary text in list views; show full text in detail drawer/modal
- For failed jobs, surface `lastError` and avoid rendering stale summary data

## Suggested API Function Signatures

```js
// auth.service.js
signupWithGoogle(payload)
loginWithGoogle(payload)

// file.service.js
uploadFile(file)
getFiles()
getFile(fileId)
softDeleteFile(fileId)
toggleStar(fileId, isStarred)
getStarredFiles()
getTrashedFiles()
getRecentFiles()
getDownloadUrl(fileId)
getProcessingStatus(jobId)
mapProcessingAnalysis(job)

// folder.service.js
createFolder(payload)
moveFileToFolder(fileId, targetFolderId)
bulkMoveFiles(fileIds, targetFolderId)
getFilesInFolder(folderId)
getAllFolders()
```

## Acceptance Criteria

1. All 17 endpoints are wired and reachable from UI interactions.
2. Authenticated endpoints always send bearer token.
3. Upload flow shows processing lifecycle from queued to terminal status.
4. Folder create and move actions work for single and bulk operations.
5. Starred, recent, trash, and all-files views all render correct data.
6. Error states are user-friendly and retry-safe.
7. No hardcoded mock data for integrated features.
8. Completed processed files display summary, entities, tags, and metadata when returned by backend.

## Notes for Agent Handoff

- Prefer implementing integration first (services + store wiring), then refine visuals.
- Keep components reusable and avoid API calls directly inside presentational components.
- Align with existing routing/state patterns already present in `frontend/src/`.
