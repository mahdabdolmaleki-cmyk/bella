// Wraps an async route handler so a rejected promise is forwarded to the
// Express error handler instead of becoming an unhandled rejection.
// Express 4 does NOT catch async errors automatically.
export const ah =
  (fn) =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export default ah;
