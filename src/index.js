// src/index.js
const express = require("express");
const Route = express.Router();

const public = require("./routes/public");
const auth = require("./routes/auth");
const agent = require("./routes/agent");
const admin = require("./routes/admin");
const media = require("./routes/media");

Route.use("/public", public);
Route.use("/auth", auth);
Route.use("/agent", agent);
Route.use("/admin", admin);
Route.use("/media", media);

module.exports = Route;