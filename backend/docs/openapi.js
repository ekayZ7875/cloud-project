import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 8080;

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
      url: `http://localhost:${PORT}`,
      description: "Local development server",
    },
    {
      url: "https://backend-v1.chunkly.tech",
      description: "Production server",
    },
  ],
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Files", description: "File operations" },
    { name: "Folders", description: "Folder operations" },
    { name: "Share", description: "File sharing endpoints" },
    { name: "Search", description: "Search endpoints" },
    { name: "Storage", description: "Storage analytics endpoints" },
    { name: "Trash", description: "Trash management endpoints" },
    { name: "Activity", description: "Activity feed endpoints" },
    { name: "AI", description: "AI Knowledge Assistant endpoints" },
    { name: "System", description: "System status and health check endpoints" },
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
    "/api/auth/google": {
      get: {
        tags: ["Auth"],
        summary: "Redirect to Google OAuth",
        description: "Starts the Google OAuth flow. The response is a redirect.",
        responses: {
          302: { description: "Redirect to Google OAuth" },
        },
      },
    },
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
                  uid: { type: "string", example: "google-oauth-uid" },
                  email: { type: "string", format: "email", example: "user@example.com" },
                  name: { type: "string", example: "Alex Johnson" },
                  avatar: { type: "string", example: "https://example.com/avatar.png" },
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
          400: { description: "Missing fields" },
          500: { description: "Auth failed" },
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
                  email: { type: "string", format: "email", example: "user@example.com" },
                  uid: { type: "string", example: "google-oauth-uid" },
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
          400: { description: "Missing fields or invalid credentials" },
          404: { description: "User does not exist" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auth/google/callback": {
      get: {
        tags: ["Auth"],
        summary: "Google OAuth callback",
        description: "Handles Google OAuth callback and issues JWT tokens.",
        responses: {
          200: {
            description: "Authenticated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSuccess" },
              },
            },
          },
          302: { description: "Redirect on auth failure" },
          500: { description: "Auth failed" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "User fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        description: "Issues a new access token using the refresh token cookie.",
        responses: {
          200: {
            description: "Access token issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    accessToken: { type: "string" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          500: { description: "Auth failed" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Clears the refresh token cookie.",
        responses: {
          200: {
            description: "Logged out",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                  },
                },
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
    "/api/files/search-by-tags": {
      get: {
        tags: ["Files"],
        summary: "Search files by LLM-generated tags",
        description: "Returns authenticated user's files whose processing analysis tags match the requested tag filters.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "tags",
            required: true,
            schema: { type: "string", example: "Invoice,Notes" },
            description: "Comma-separated tags to search for",
          },
          {
            in: "query",
            name: "match",
            required: false,
            schema: { type: "string", enum: ["any", "all"], default: "any" },
            description: "any = match at least one tag, all = match all requested tags",
          },
          {
            in: "query",
            name: "folderId",
            required: false,
            schema: { type: "string" },
            description: "Optional folder filter",
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        ],
        responses: {
          200: {
            description: "Matched files fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    totalMatches: { type: "integer", example: 2 },
                    files: {
                      type: "array",
                      items: {
                        allOf: [
                          { $ref: "#/components/schemas/FileMetadata" },
                          {
                            type: "object",
                            properties: {
                              processingStatus: { type: "string", nullable: true },
                              tags: {
                                type: "array",
                                items: { type: "string" },
                              },
                              matchedTags: {
                                type: "array",
                                items: { type: "string" },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Invalid tags or match query" },
          500: { description: "Internal error" },
        },
      },
    },
    "/api/files/tags": {
      get: {
        tags: ["Files"],
        summary: "Get tags for every user file",
        description: "Returns tags for each non-deleted file owned by the authenticated user.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "folderId",
            required: false,
            schema: { type: "string" },
            description: "Optional folder filter",
          },
        ],
        responses: {
          200: {
            description: "File tags fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    totalFiles: { type: "integer", example: 4 },
                    uniqueTags: {
                      type: "array",
                      items: { type: "string" },
                    },
                    files: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          fileId: { type: "string" },
                          fileName: { type: "string" },
                          folderId: { type: "string", nullable: true },
                          jobId: { type: "string", nullable: true },
                          processingStatus: { type: "string", nullable: true },
                          tags: {
                            type: "array",
                            items: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
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
                        allowedBytes: { type: "number", example: 19327352832 },
                        remainingBytes: { type: "number", example: 19327342592 },
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
    "/api/share/create": {
      post: {
        tags: ["Share"],
        summary: "Create or update a file share",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fileId: { type: "string" },
                  recipientEmail: { type: "string", format: "email" },
                  permission: { type: "string", enum: ["VIEW", "COMMENT", "EDIT"], default: "VIEW" },
                  expiresAt: { type: "string", format: "date-time" },
                  emailNotification: { type: "boolean", default: true }
                },
                required: ["fileId", "recipientEmail"]
              }
            }
          }
        },
        responses: {
          201: { description: "File shared or updated successfully" },
          400: { description: "Invalid request payload" },
          404: { description: "File not found" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/share/revoke": {
      post: {
        tags: ["Share"],
        summary: "Revoke a file share",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  shareId: { type: "string" }
                },
                required: ["shareId"]
              }
            }
          }
        },
        responses: {
          200: { description: "Share revoked successfully" },
          404: { description: "Share not found" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/share/file": {
      get: {
        tags: ["Share"],
        summary: "List all shares for a specific file",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "fileId",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: { description: "Shares fetched successfully" },
          400: { description: "Invalid fileId" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/share/shared-with-me": {
      get: {
        tags: ["Share"],
        summary: "List files shared with the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Shared files fetched successfully" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/share/permission": {
      patch: {
        tags: ["Share"],
        summary: "Update permission level for a share",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  shareId: { type: "string" },
                  permission: { type: "string", enum: ["VIEW", "COMMENT", "EDIT"] }
                },
                required: ["shareId", "permission"]
              }
            }
          }
        },
        responses: {
          200: { description: "Share permission updated" },
          400: { description: "Invalid request payload" },
          404: { description: "Share not found" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/share/accept": {
      post: {
        tags: ["Share"],
        summary: "Accept a file share invitation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  shareId: { type: "string" }
                },
                required: ["shareId"]
              }
            }
          }
        },
        responses: {
          200: { description: "Share accepted" },
          403: { description: "Not allowed to accept this share" },
          404: { description: "Share not found" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/share/decline": {
      post: {
        tags: ["Share"],
        summary: "Decline a file share invitation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  shareId: { type: "string" }
                },
                required: ["shareId"]
              }
            }
          }
        },
        responses: {
          200: { description: "Share declined" },
          403: { description: "Not allowed to decline this share" },
          404: { description: "Share not found" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/search": {
      get: {
        tags: ["Search"],
        summary: "Search files by name, MIME type, or tier",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "q",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    files: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/storage": {
      get: {
        tags: ["Storage"],
        summary: "Get storage usage breakdown",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Storage stats fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    storage: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/trash": {
      get: {
        tags: ["Trash"],
        summary: "Get all trashed files",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Trashed files fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    files: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
      delete: {
        tags: ["Trash"],
        summary: "Empty trash",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Trash emptied" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/trash/{fileId}/restore": {
      patch: {
        tags: ["Trash"],
        summary: "Restore a file from trash",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "fileId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "File restored" },
          404: { description: "File not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/trash/{fileId}": {
      delete: {
        tags: ["Trash"],
        summary: "Permanently delete a file",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "fileId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "File permanently deleted" },
          404: { description: "File not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/activity": {
      get: {
        tags: ["Activity"],
        summary: "Get activity feed",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "type",
            required: false,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "search",
            required: false,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", default: 50 },
          },
        ],
        responses: {
          200: {
            description: "Activity feed fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    activities: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
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
    "/api/ai/query": {
      post: {
        tags: ["AI"],
        summary: "Ask AI questions based on user files",
        description: "Process natural language queries to summarize, extract key points, or detect tasks across the user's files.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  query: { type: "string", example: "Summarize my files" },
                  fileId: { type: "string", nullable: true, example: "FILE_123" },
                  folderId: { type: "string", nullable: true, example: "FOLD_456" },
                  studyMode: { type: "boolean", nullable: true, example: true, description: "Whether to format and focus the response for learning/study" },
                  chatId: { type: "string", nullable: true, example: "CHAT_abc123", description: "Optional chat session ID for multi-turn conversations" }
                },
                required: ["query"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "AI response generated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "string", example: "Here is the summary of your files..." },
                    response: { type: "string", example: "⚠️ I could not find this information in your files." }
                  },
                },
              },
            },
          },
          400: { description: "Missing query" },
          500: { description: "Server error" },
        },
      },
    },
    "/api/ai/chats": {
      get: {
        tags: ["AI"],
        summary: "Get all chat sessions for authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Chats retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          userId: { type: "string" },
                          chatId: { type: "string" },
                          title: { type: "string" },
                          createdAt: { type: "string", format: "date-time" },
                          updatedAt: { type: "string", format: "date-time" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          500: { description: "Server error" }
        }
      },
      post: {
        tags: ["AI"],
        summary: "Create a new chat session",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", example: "My Study Chat" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Chat session created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        userId: { type: "string" },
                        chatId: { type: "string" },
                        title: { type: "string" },
                        messages: { type: "array", items: { type: "object" } },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                      }
                    }
                  }
                }
              }
            }
          },
          500: { description: "Server error" }
        }
      }
    },
    "/api/ai/chats/{chatId}": {
      get: {
        tags: ["AI"],
        summary: "Get chat session details and message history",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "chatId",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Chat details retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        userId: { type: "string" },
                        chatId: { type: "string" },
                        title: { type: "string" },
                        messages: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              role: { type: "string", example: "user" },
                              content: { type: "string" },
                              timestamp: { type: "string", format: "date-time" }
                            }
                          }
                        },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                      }
                    }
                  }
                }
              }
            }
          },
          404: { description: "Chat not found" },
          500: { description: "Server error" }
        }
      }
    },
    "/api/ai/insights": {
      get: {
        tags: ["AI"],
        summary: "Get smart notifications and insights",
        description: "Returns upload activity insights and detected deadlines from processed files.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "windowDays",
            required: false,
            schema: { type: "integer", default: 7, minimum: 1 },
          },
          {
            in: "query",
            name: "deadlineLimit",
            required: false,
            schema: { type: "integer", default: 5, minimum: 1 },
          },
        ],
        responses: {
          200: {
            description: "Smart insights generated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        insights: {
                          type: "array",
                          items: { type: "string" },
                          example: [
                            "You uploaded 5 files this week",
                            "Deadline detected in file: 28 March (resume.pdf)",
                          ],
                        },
                        summary: {
                          type: "object",
                          properties: {
                            weeklyUploads: { type: "integer", example: 5 },
                            totalFiles: { type: "integer", example: 18 },
                            deadlinesDetected: { type: "integer", example: 3 },
                            windowDays: { type: "integer", example: 7 },
                          },
                        },
                        generatedAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          500: { description: "Server error" },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Verify system health and status of external services",
        description: "Runs status checks on external integrations including SQS, DynamoDB, Qdrant vector database, S3, and Gemini LLM. Returns status details.",
        responses: {
          200: {
            description: "System is fully healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "healthy" },
                    timestamp: { type: "string", format: "date-time" },
                    system: {
                      type: "object",
                      properties: {
                        uptime: { type: "number", example: 12.34 },
                        memoryUsage: { type: "object", additionalProperties: true },
                        platform: { type: "string", example: "win32" },
                        nodeVersion: { type: "string", example: "v24.13.1" },
                        env: { type: "string", example: "development" }
                      }
                    },
                    services: {
                      type: "object",
                      properties: {
                        dynamodb: {
                          type: "object",
                          properties: {
                            status: { type: "string", example: "healthy" },
                            details: { type: "object", additionalProperties: true },
                            error: { type: "string", nullable: true, example: null }
                          }
                        },
                        s3: {
                          type: "object",
                          properties: {
                            status: { type: "string", example: "healthy" },
                            details: { type: "object", additionalProperties: true },
                            error: { type: "string", nullable: true, example: null }
                          }
                        },
                        sqs: {
                          type: "object",
                          properties: {
                            status: { type: "string", example: "healthy" },
                            details: { type: "object", additionalProperties: true },
                            error: { type: "string", nullable: true, example: null }
                          }
                        },
                        qdrant: {
                          type: "object",
                          properties: {
                            status: { type: "string", example: "healthy" },
                            details: { type: "object", additionalProperties: true },
                            error: { type: "string", nullable: true, example: null }
                          }
                        },
                        llm: {
                          type: "object",
                          properties: {
                            status: { type: "string", example: "healthy" },
                            details: { type: "object", additionalProperties: true },
                            error: { type: "string", nullable: true, example: null }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          503: {
            description: "One or more system services are unhealthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "unhealthy" },
                    timestamp: { type: "string", format: "date-time" },
                    services: {
                      type: "object",
                      additionalProperties: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
};
