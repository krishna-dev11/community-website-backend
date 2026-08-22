const crypto = require("node:crypto");

function requestContext(req, res, next) {
  req.id = req.header("x-request-id") || crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}

module.exports = requestContext;
