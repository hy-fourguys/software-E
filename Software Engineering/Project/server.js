const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// Database connection pool configuration
const pool = new Pool({
    user: 'postgres', // Replace with your actual PostgreSQL username
    host: 'localhost', // Host of your database, typically 'localhost' for local development
    database: 'barcode_scanner', // Replace with your actual database name
    password: 'new_password', // Replace with your actual password
    port: 5432, // Default PostgreSQL port
});

// Middleware setup
app.use(cors());
app.use(express.json());

// Endpoint to get product by barcode
app.get('/product/:barcode', async (req, res) => {
    const { barcode } = req.params;
    console.log(`Received request for barcode: ${barcode}`); // Log received barcode for debugging

    try {
        // Query the database for the product by barcode
        const result = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
        
        // Log the query result for debugging
        console.log('Query result:', result.rows);

        if (result.rows.length > 0) {
            // Product found, send the response
            res.json(result.rows[0]);
        } else {
            // Product not found
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        // Log the full error stack for better debugging
        console.error('Error fetching product:', error.stack);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

