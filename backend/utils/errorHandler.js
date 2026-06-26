const errorHandler = (status, title, detail, response = {}) => ({
  response,
  errors: {
    status,
    title,
    detail,
  },
});

export { errorHandler };
