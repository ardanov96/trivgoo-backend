const express = require("express");
const Route = express.Router();


const public = require("./routes/public");
const auth = require("./routes/auth");
const agent = require("./routes/agent");
const admin = require("./routes/admin");
const media = require("./routes/media");

Route.use("/api/v1", public);
Route.use("/api/v1/auth", auth);
Route.use("/api/v1/agent", agent);
Route.use("/api/v1/admin", admin);
Route.use("/api/v1/media", media);

module.exports = Route;
