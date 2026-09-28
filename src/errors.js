"use strict";

// HTTP 业务错误。路由层据此返回状态码和机器可读的 error code。
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

module.exports = { HttpError };