const express = require('express');
const Route = express.Router();
const productModel = require('../models/product');


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
    try {
        const db = require('../configs/db');
        const [rows] = await db.query("SELECT id, name FROM categories");
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Category Error:", err);
        res.status(500).json({ success: false, data: [] }); 
    }
});

Route.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productModel.get_product_by_id(id); 

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ 
      success: true, 
      data: product 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = Route;