export const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statuscode || 500
  const message = err.message || 'Something went wrong'

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
    data: null,
  })
}