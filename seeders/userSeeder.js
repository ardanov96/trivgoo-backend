'use strict';

const bcrypt = require('bcryptjs');
const { execute, pool } = require('../src/configs/db');

async function seedUsers() {
  try {
    console.log('--- Memulai Seeding Multi-Role User ---');

    // Daftar user yang akan dimasukkan
    const users = [
      {
        name: 'Admin Trivigo',
        email: 'admin@trivigo.com',
        password: 'admin123456',
        role: 'ADMIN',
        status: 'VERIFIED'
      },
      {
        name: 'Customer Trivigo',
        email: 'customer@trivigo.com',
        password: 'customer123',
        role: 'CUSTOMER',
        status: 'VERIFIED'
      },
      {
        name: 'Agent Trivigo',
        email: 'agent@trivigo.com',
        password: 'agent123',
        role: 'AGENT',
        status: 'VERIFIED'
      }
    ];

    const sql = `
      INSERT INTO users (
        name, 
        email, 
        password_hash, 
        role, 
        is_active, 
        verification_status, 
        created_at, 
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
      password_hash = VALUES(password_hash),
      role = VALUES(role),
      verification_status = VALUES(verification_status),
      updated_at = NOW();
    `;

    for (const user of users) {
      const password_hash = await bcrypt.hash(user.password, 10);
      
      await execute(sql, [
        user.name,
        user.email,
        password_hash,
        user.role,
        1, // is_active
        user.status
      ]);
      
      console.log(`✅ Success: User [${user.role}] ${user.email} berhasil diproses.`);
    }

  } catch (error) {
    console.error('❌ Error Seeding:', error.message);
  } finally {
    if (pool) {
      await pool.end();
      console.log('--- Koneksi Database Ditutup ---');
    }
    process.exit();
  }
}

seedUsers();