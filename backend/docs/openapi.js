export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Cloud Project API",
    version: "1.0.0",
    description:
      "REST APIs for authentication, file management, folder management, and file-processing metadata.",
  },
  servers: [
    {
      url: "http://localhost:8080",
      description: "Local development server",
    },
  ],
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Files", description: "File operations" },
    { name: "Folders", description: "Folder operations" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          response: {
            type: "object",
            additionalProperties: true,
          },
          errors: {
            type: "object",
            properties: {
              status: { type: "integer", example: 400 },
              title: { type: "string", example: "Bad Request" },
              detail: { type: "string", example: "Invalid request payload" },
            },
            required: ["status", "title", "detail"],
          },
        },
      },
      User: {
        type: "object",
        properties: {
          userId: { type: "string", example: "USR_abc123" },
          email: { type: "string", format: "email" },
          fullname: { type: "string", nullable: true },
          lastname: { type: "string", nullable: true },
          avatar: { type: "string", nullable: true },
        },
      },
      AuthSuccess: {
        type: "object",
        properties: {
          response: {
            type: "object",
            properties: {
              token: { type: "string" },
              user: { $ref: "#/components/schemas/User" },
              message: { type: "string", example: "Login successful" },
              status: { type: "integer", example: 200 },
            },
          },
        },
      },
      FileMetadata: {
        type: "object",
        properties: {
          userId: { type: "string" },
          fileId: { type: "string" },
          fileName: { type: "string" },
          fileType: { type: "string" },
          fileSize: { type: "integer" },
          s3Url: { type: "string" },
          folderId: { type: "string", nullable: true },
          isStarred: { type: "boolean" },
          isDeleted: { type: "boolean" },
          uploadedAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Folder: {
        type: "object",
        properties: {
          userId: { type: "string" },
          folderId: { type: "string" },
          name: { type: "string" },
          parentFolderId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ProcessingJob: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          fileId: { type: "string" },
          status: { type: "string", example: "PENDING" },
          attempt: { type: "integer", example: 1 },
          lastError: { type: "string", nullable: true },
          analysis: {
            oneOf: [{ type: "object", additionalProperties: true }, { type: "null" }],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  paths: {
    "/api/auth/google-signup": {
      post: {
        tags: ["Auth"],
        summary: "Sign up or sign in with Google UID",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  uid: { type: "string" },
                  email: { type: "string", format: "email" },
                  name: { type: "string" },
                  avatar: { type: "string" },
                },
                required: ["uid", "email", "name"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Authenticated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSuccess" },
              },
            },
          },
          400: {
            description: "Missing fields",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          500: {
            description: "Auth failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/google-login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and Google UID",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  uid: { type: "string" },
                },
                required: ["email", "uid"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSuccess" },
              },
            },
          },
          400: {
            description: "Missing fields or invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          500: {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/files/upload-file": {
      post: {
        tags: ["Files"],
        summary: "Upload a file and queue processing",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                  },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "File uploaded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    fileUrl: { type: "string" },
                    fileId: { type: "string" },
                    jobId: { type: "string" },
                    processingStatus: { type: "string", example: "PENDING" },
                  },
                },
              },
            },
          },
          400: {
            description: "No file uploaded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          403: {
            description: "Storage limit exceeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          500: {
            description: "Upload or queueing error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/files/get-files": {
      get: {
        tags: ["Files"],
        summary: "Get all files for authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Files fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    files: {
                      type: "array",
                      items: { $ref: "#/components/schemas/FileMetadata" },
                    },
                  },
                },
              },
            },
          },
          500: {
            description: "Failed to fetch user files",
          },
        },
      },
    },
    "/api/files/get-file": {
      get: {
        tags: ["Files"],
        summary: "Get one file by fileId",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "fileId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "File fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    file: { $ref: "#/components/schemas/FileMetadata" },
                  },
                },
              },
            },
          },
          400: { description: "Missing fileId" },
          404: { description: "File not found" },
          500: { description: "Internal error" },
        },
      },
    },
    "/api/files/delete-files": {
      post: {
        tags: ["Files"],
        summary: "Soft-delete one file by fileId query parameter",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "fileId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "File moved to trash",
          },
          404: { description: "File not found" },
          500: { description: "Delete failed" },
        },
      },
    },
    "/api/files/star-file": {
      post: {
        tags: ["Files"],
        summary: "Toggle starred state for a file",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fileId: { type: "string" },
                  isStarred: { type: "boolean" },
                },
                required: ["fileId", "isStarred"],
              },
            },
          },
        },
        responses: {
          200: { description: "File star status updated" },
          400: { description: "Invalid request" },
          500: { description: "Internal error" },
        },
      },
    },
    "/api/files/get-starred-files": {
      get: {
        tags: ["Files"],
        summary: "Get starred files",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Starred files fetched" },
          500: { description: "Failed to fetch starred files" },
        },
      },
    },
    "/api/files/get-trashed-files": {
      get: {
        tags: ["Files"],
        summary: "Get trashed files",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Trashed files fetched" },
          500: { description: "Failed to fetch trash files" },
        },
      },
    },
    "/api/files/get-recent-files": {
      get: {
        tags: ["Files"],
        summary: "Get recent uploads (last 5 hours)",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Recent files fetched" },
          500: { description: "Failed to fetch recent uploads" },
        },
      },
    },
    "/api/files/download-file": {
      post: {
        tags: ["Files"],
        summary: "Get signed download URL for a file",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "fileId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Download URL generated" },
          404: { description: "File not found" },
          500: { description: "Download failed" },
        },
      },
    },
    "/api/files/storage-capacity": {
      get: {
        tags: ["Files"],
        summary: "Get authenticated user's storage usage and remaining capacity",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Storage capacity fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    storage: {
                      type: "object",
                      properties: {
                        usedBytes: { type: "number", example: 10240 },
                        allowedBytes: { type: "number", example: 1073741824 },
                        remainingBytes: { type: "number", example: 1073731584 },
                        usagePercentage: { type: "number", example: 0.95 },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: "User not found" },
          500: { description: "Internal error" },
        },
      },
    },
    "/api/files/processing-status/{jobId}": {
      get: {
        tags: ["Files"],
        summary: "Get background processing status",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "jobId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Status fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    job: { $ref: "#/components/schemas/ProcessingJob" },
                  },
                },
              },
            },
          },
          404: { description: "Job not found" },
          500: { description: "Failed to fetch status" },
        },
      },
    },
    "/api/folder/create-folder": {
      post: {
        tags: ["Folders"],
        summary: "Create a folder",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  parentFolderId: { type: "string", nullable: true },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          201: { description: "Folder created" },
          400: { description: "Invalid request" },
          500: { description: "Create folder failed" },
        },
      },
    },
    "/api/folder/move-file-to-folder": {
      post: {
        tags: ["Folders"],
        summary: "Move one file to target folder",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "fileId",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetFolderId: { type: "string" },
                },
                required: ["targetFolderId"],
              },
            },
          },
        },
        responses: {
          200: { description: "File moved" },
          400: { description: "Invalid request" },
          500: { description: "Move failed" },
        },
      },
    },
    "/api/folder/bulk-move-files": {
      post: {
        tags: ["Folders"],
        summary: "Bulk move files to target folder",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fileIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                  targetFolderId: { type: "string" },
                },
                required: ["fileIds", "targetFolderId"],
              },
            },
          },
        },
        responses: {
          200: { description: "Files moved" },
          400: { description: "Invalid request" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/folder/get-files": {
      get: {
        tags: ["Folders"],
        summary: "Get files in a specific folder",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "folderId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Folder files fetched" },
          400: { description: "Missing folderId" },
          500: { description: "Fetch failed" },
        },
      },
    },
    "/api/folder/get-all-folders": {
      get: {
        tags: ["Folders"],
        summary: "Get all folders for user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Folders fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    folders: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Folder" },
                    },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
  },
};
