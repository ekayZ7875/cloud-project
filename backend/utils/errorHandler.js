export const errorHandler = (
  status = 500,
  title = "Internal Server Error",
  detail = "Error in processing request! Please try again later."
) => {
  return {
    response: {},
    errors: {
      status,
      title,
      detail,
    },
  };
};


