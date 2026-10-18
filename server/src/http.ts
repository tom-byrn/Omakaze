import type { ErrorRequestHandler } from 'express';

/** An error with an HTTP status that is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFound(message = 'Not found'): HttpError {
  return new HttpError(404, message);
}

export function validationError(fields: Record<string, string | undefined>): HttpError {
  const clean = Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  return new HttpError(400, 'Please fix the highlighted fields', clean);
}

/** Parses a positive integer route parameter, treating anything else as "not found". */
export function parseId(raw: string | undefined, what = 'Resource'): number {
  const id = Number(raw);
  if (!raw || !Number.isSafeInteger(id) || id <= 0) {
    throw notFound(`${what} not found`);
  }
  return id;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
    });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Request body must be valid JSON' } });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Request body is too large' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { message: 'Something went wrong on our side' } });
};
