class ApiResponse {
  constructor(message, data = null, meta = null) {
    this.success = true;
    this.message = message;
    if (data !== null) this.data = data;
    if (meta !== null) this.meta = meta;
  }
}

module.exports = ApiResponse;
