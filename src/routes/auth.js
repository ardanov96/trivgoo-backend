const express = require("express");
const Route = express.Router();

const auth = require("../controllers/auth");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

Route.post("/login", auth.login);
Route.post("/register", auth.register);

Route.get("/me", requireAuth, auth.me);
Route.post("/logout", requireAuth, auth.logout);

Route.patch("/update-profile", requireAuth, upload.single("profile_photo"), auth.update_profile);

Route.post("/forgot-password", auth.forgot_password);
Route.get("/reset-password", auth.validate_reset_token);
Route.post("/reset-password", auth.reset_password);

Route.get("/verify-email", auth.verify_email);

module.exports = Route;
