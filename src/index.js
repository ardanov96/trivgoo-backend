// src/index.js
const express = require("express");
const Route = express.Router();

const publicRoutes    = require("./routes/public");
const auth            = require("./routes/auth");
const agent           = require("./routes/agent");
const admin           = require("./routes/admin");
const media           = require("./routes/media");
const cars            = require("./routes/car");
const cart            = require("./routes/cart");
const payment         = require("./routes/payment");
const bookings        = require("./routes/booking");
const promoCampaign   = require("./routes/promo_campaign");
const loyalty         = require("./routes/loyalty");
const voucher         = require("./routes/voucher");
const chat            = require("./routes/chat");

Route.use("/", publicRoutes);
Route.use("/auth", auth);
Route.use("/agent", agent);
Route.use("/chat", chat);
Route.use("/admin", admin);
Route.use("/media", media);
Route.use("/cars", cars);
Route.use("/cart", cart);
Route.use("/payment", payment);
Route.use("/bookings", bookings);
Route.use("/promo-campaigns", promoCampaign);
Route.use("/loyalty", loyalty);
Route.use("/vouchers", voucher);

module.exports = Route;