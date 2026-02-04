const express = require('express');
const Route = express.Router();
const productModel = require('../models/product'); // Memanggil model product.js

// Route ini untuk halaman Explore (Tanpa requireAuth)
Route.get('/products', async (req, res) => {
  try {
    const products = await productModel.list_all_products();
    res.json({ 
      success: true, 
      data: products 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Route untuk kategori
Route.get('/categories', async (req, res) => {
    // Panggil model kategori Anda di sini
    // Contoh sederhana:
    const [rows] = await require('../configs/db').execute("SELECT * FROM categories");
    res.json({ success: true, data: rows });
});

module.exports = Route;