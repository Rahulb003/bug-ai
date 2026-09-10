export function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Route not found."
  });
}

export function errorHandler(error, req, res, next) {
  const status = error.statusCode || 500;
  res.status(status).json({
    error: error.message || "Unexpected server error."
  });
}
