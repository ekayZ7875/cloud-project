export class PipelineError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.retryable = options.retryable ?? false;
    this.code = options.code || "PIPELINE_ERROR";
    this.details = options.details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class InvalidLlmJsonError extends PipelineError {
  constructor(message, details) {
    super(message, {
      retryable: true,
      code: "INVALID_LLM_JSON",
      details,
    });
  }
}

export class TransientProviderError extends PipelineError {
  constructor(message, details) {
    super(message, {
      retryable: true,
      code: "TRANSIENT_PROVIDER_ERROR",
      details,
    });
  }
}

export class NonRetryableProcessingError extends PipelineError {
  constructor(message, details) {
    super(message, {
      retryable: false,
      code: "NON_RETRYABLE_PROCESSING_ERROR",
      details,
    });
  }
}
