class ApiResponse {
  static success(res, { statusCode = 200, message = 'Success', data = null } = {}) {
    const response = {
      success: true,
      message,
    };
    if (data !== null) {
      response.data = data;
    }
    return res.status(statusCode).json(response);
  }

  static created(res, { message = 'Created successfully', data = null } = {}) {
    return ApiResponse.success(res, { statusCode: 201, message, data });
  }

  static noContent(res) {
    return res.status(204).send();
  }

  static paginated(res, { data, page, limit, total, message = 'Success' } = {}) {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
}

export default ApiResponse;
