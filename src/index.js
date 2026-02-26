// src/index.js
const express = require("express");
const Route = express.Router();

const publicRoutes = require("./routes/public");
const auth = require("./routes/auth");
const agent = require("./routes/agent");
const admin = require("./routes/admin");
const media = require("./routes/media");
const cars = require("./routes/car");
const cart = require("./routes/cart");


Route.use("/", publicRoutes);
Route.use("/auth", auth);
Route.use("/agent", agent);
Route.use("/admin", admin);
Route.use("/media", media);
Route.use("/cars", cars);
Route.use("/cart", cart);

module.exports = Route;