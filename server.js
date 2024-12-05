const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from the root

// Start server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// PostgreSQL connection
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "barcode_scanner",
    password: "your_password",
    port: 5432,
});

// Middleware to parse JSON (if not already added)
app.use(express.json());

// Middleware to extract and validate userId
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log("Headers:", req.headers);
    console.log("Query Parameters:", req.query);

    const userId = req.headers["x-user-id"] || req.query.userId;
    if (!userId) {
        console.error(`[${new Date().toISOString()}] Missing userId in request.`);
        return res.status(400).json({ message: "Missing userId in request." });
    }
    req.userId = userId;
    console.log(`[${new Date().toISOString()}] Extracted userId: ${userId}`);
    next();
});

// API endpoint to fetch a product by barcode
app.get("/api/products/:barcode", async (req, res) => {
    const { barcode } = req.params;

    try {
        const result = await pool.query("SELECT * FROM products WHERE barcode = $1", [barcode]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching product by barcode:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// API endpoint to add a product to the cart
app.post("/api/cart", async (req, res) => {
    const { product_id, product_name, price, shop_name } = req.body;
    const userId = req.userId;

    if (!product_id || !product_name || typeof price === "undefined" || isNaN(price)) {
        return res.status(400).json({ message: "Invalid product data" });
    }

    const selectedShop = shop_name || "Hanaro Mart";
    const validShops = ["Hanaro Mart", "CU", "GS25", "7-Eleven", "Emart24", "Lotte Super", "E-Mart", "Homeplus", "Lotte Mart"];

    if (!validShops.includes(selectedShop)) {
        return res.status(400).json({ message: `Invalid shop name: ${selectedShop}` });
    }

    try {
        const cartCheck = await pool.query("SELECT DISTINCT shop_name FROM cart WHERE user_id = $1", [userId]);
        if (cartCheck.rows.length > 0 && cartCheck.rows[0].shop_name !== selectedShop) {
            return res.status(400).json({
                message: `Cart is associated with ${cartCheck.rows[0].shop_name}. Clear the cart before adding products from another shop.`,
            });
        }

        const existingProduct = await pool.query("SELECT * FROM cart WHERE product_id = $1 AND user_id = $2", [product_id, userId]);

        if (existingProduct.rows.length > 0) {
            await pool.query("UPDATE cart SET quantity = quantity + 1 WHERE product_id = $1 AND user_id = $2", [product_id, userId]);
        } else {
            await pool.query(
                "INSERT INTO cart (user_id, product_id, product_name, price, quantity, shop_name) VALUES ($1, $2, $3, $4, $5, $6)",
                [userId, product_id, product_name, price, 1, selectedShop]
            );
        }

        res.status(200).json({ message: "Product added to cart" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// API endpoint to retrieve cart items
app.get("/api/cart", async (req, res) => {
    const userId = req.userId;

    try {
        const result = await pool.query(`
            SELECT 
                c.*, 
                EXISTS (
                    SELECT 1 
                    FROM bookmarks b 
                    WHERE b.product_id = c.product_id AND b.user_id = $1
                ) AS bookmarked
            FROM cart c
            WHERE c.user_id = $1
            ORDER BY c.id ASC
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// API endpoint to update product quantity
app.put("/api/cart/:productId", async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.userId;

    try {
        const result = await pool.query(
            "UPDATE cart SET quantity = $1 WHERE product_id = $2 AND user_id = $3 RETURNING product_id, price, quantity",
            [quantity, productId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Product not found in cart." });
        }

        const updatedProduct = result.rows[0];
        updatedProduct.total = updatedProduct.price * updatedProduct.quantity;

        res.status(200).json(updatedProduct);
    } catch (err) {
        console.error("Error updating quantity:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});



// API endpoint to remove a specific product from the cart
app.delete("/api/cart/:productId", async (req, res) => {
    const { productId } = req.params;
    const userId = req.userId; // Middleware extracts this

    try {
        const result = await pool.query(
            "DELETE FROM cart WHERE product_id = $1 AND user_id = $2 RETURNING *",
            [productId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Product not found in cart." });
        }

        res.status(200).json({ message: "Product removed from cart" });
    } catch (err) {
        console.error("Server error while removing product:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});


// API endpoint to clear the cart (checkout)
app.post("/api/cart/checkout", async (req, res) => {
    try {
        const cartItems = await pool.query("SELECT * FROM cart");
        if (cartItems.rows.length === 0) {
            return res.status(400).json({ message: "Cart is empty." });
        }

        const shopName = cartItems.rows[0].shop_name;
        const totalSum = cartItems.rows.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const receiptResult = await pool.query(
            `INSERT INTO Receipts (shop_name, total_sum) VALUES ($1, $2) RETURNING receipt_id`,
            [shopName, totalSum]
        );

        const receiptId = receiptResult.rows[0].receipt_id;

        const insertPromises = cartItems.rows.map(item =>
            pool.query(
                `INSERT INTO ReceiptItems (receipt_id, product_id, quantity, price) 
                 VALUES ($1, $2, $3, $4)`,
                [receiptId, item.product_id, item.quantity, item.price]
            )
        );
        await Promise.all(insertPromises);

        await pool.query("DELETE FROM cart");

        const receiptDetails = {
            receiptId,
            shopName,
            totalSum,
            items: cartItems.rows.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                price: item.price,
                total: item.quantity * item.price,
            })),
        };

        res.status(200).json({ message: "Checkout successful", receipt: receiptDetails });
    } catch (err) {
        console.error("Checkout error:", err);
        res.status(500).json({ message: "Server error during checkout." });
    }
});

// API endpoint to clear the cart
app.delete("/api/cart", async (req, res) => {
    const userId = req.userId;

    try {
        await pool.query("DELETE FROM cart WHERE user_id = $1", [userId]);
        res.status(200).json({ message: "Cart cleared successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// API endpoint to add a product to bookmarks
// POST /api/bookmarks/:productId
app.post("/api/bookmarks/:productId", async (req, res) => {
    const userId = req.userId; // Extracted from middleware
    const { productId } = req.params;

    if (!userId || !productId) {
        return res.status(400).json({ message: "Missing userId or productId." });
    }

    try {
        const result = await pool.query(
            "INSERT INTO bookmarks (user_id, product_id) VALUES ($1, $2) RETURNING *",
            [userId, productId]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(409).json({ message: "Product is already bookmarked." });
        }
        console.error("Error adding bookmark:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Remove Bookmark
app.delete("/api/bookmarks/:productId", async (req, res) => {
    const userId = req.userId; // Extracted from middleware
    const { productId } = req.params;

    if (!userId || !productId) {
        return res.status(400).json({ message: "Missing userId or productId." });
    }

    try {
        const result = await pool.query(
            "DELETE FROM bookmarks WHERE user_id = $1 AND product_id = $2 RETURNING *",
            [userId, productId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Bookmark not found." });
        }

        res.status(200).json({ message: "Bookmark removed successfully." });
    } catch (err) {
        console.error("Error removing bookmark:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});


// Get Bookmarks
app.get("/api/bookmarks", async (req, res) => {
    const userId = req.userId;

    try {
        const result = await pool.query(
            `SELECT b.product_id, p.product_name, p.price 
             FROM bookmarks b
             LEFT JOIN products p ON b.product_id = p.product_id
             WHERE b.user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No bookmarks found." });
        }

        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching bookmarks:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// API endpoint to remove a bookmark
app.delete("/api/bookmarks/:productId", async (req, res) => {
    const { productId } = req.params;

    if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
    }

    try {
        const result = await pool.query(
            "DELETE FROM bookmarks WHERE product_id = $1 RETURNING *",
            [productId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Bookmark not found" });
        }

        res.status(200).json({ message: "Bookmark removed successfully" });
    } catch (err) {
        console.error("Error removing bookmark:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// Stripe payment process
const stripe = require("stripe")("sk_test_51QR9TSA9PYZCuSc2z5fm8OsTRe93X3x2nV1LXtYzQLh74Rj5z5h3PVQLCh20EUYc1Cj5DIoGHA52ICwi1vLSO4LW008de7QDSr");

app.post("/api/stripe/create-checkout-session", async (req, res) => {
    const userId = req.userId; // Extracted from middleware

    try {
        // Fetch the total amount directly from the database
        const result = await pool.query("SELECT SUM(price * quantity) AS total_amount FROM cart WHERE user_id = $1", [userId]);
        const totalFromDb = result.rows[0]?.total_amount;

        if (!totalFromDb || totalFromDb <= 0) {
            return res.status(400).json({ message: "Cart is empty or total not calculated." });
        }

        // Validate the total received from the client
        const totalFromClient = req.body.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

        if (Math.abs(totalFromClient - totalFromDb) > 0.01) {
            return res.status(400).json({ message: "Cart total mismatch. Please refresh your cart." });
        }

        // Prepare Stripe session payload
        const payload = {
            payment_method_types: ["card"],
            line_items: req.body.cart.map(item => ({
                price_data: {
                    currency: "usd",
                    product_data: { name: item.product_name },
                    unit_amount: Math.round(item.price * 100),
                },
                quantity: item.quantity,
            })),
            mode: "payment",
            success_url: "http://localhost:5000/success.html",
            cancel_url: "http://localhost:5000/cart.html",
        };

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create(payload);

        // Respond with the session ID
        res.json({ sessionId: session.id });
    } catch (err) {
        console.error("Error creating Stripe checkout session:", err);
        res.status(500).json({ message: "Failed to create checkout session." });
    }
});


// API to handle successful payments and generate a receipt
app.post("/api/stripe/payment-success", async (req, res) => {
    const userId = req.userId; // Extract userId from middleware

    if (!userId) {
        return res.status(400).json({ message: "Missing userId in request." });
    }

    try {
        const cartItems = await pool.query("SELECT * FROM cart WHERE user_id = $1", [userId]);
        if (cartItems.rows.length === 0) {
            return res.status(400).json({ message: "Cart is empty. Cannot create a receipt." });
        }

        const shopName = cartItems.rows[0].shop_name;
        const totalSum = cartItems.rows.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // Insert receipt into Receipts table
        const receiptResult = await pool.query(
            `INSERT INTO Receipts (user_id, shop_name, total_sum) VALUES ($1, $2, $3) RETURNING receipt_id`,
            [userId, shopName, totalSum]
        );
        const receiptId = receiptResult.rows[0].receipt_id;

        // Insert items into ReceiptItems table
        const insertItemsPromises = cartItems.rows.map(item =>
            pool.query(
                `INSERT INTO ReceiptItems (receipt_id, product_id, quantity, price) 
                 VALUES ($1, $2, $3, $4)`,
                [receiptId, item.product_id, item.quantity, item.price]
            )
        );
        await Promise.all(insertItemsPromises);

        // Clear cart after receipt generation
        await pool.query("DELETE FROM cart WHERE user_id = $1", [userId]);

        res.status(200).json({ message: "Payment successful and receipt generated." });
    } catch (err) {
        console.error("Error during payment success processing:", err);
        res.status(500).json({ message: "Failed to process payment and generate receipt.", error: err.message });
    }
});


// API to retrieve all receipts
app.get("/api/receipts", async (req, res) => {
    const userId = req.userId;

    try {
        const receipts = await pool.query(`
            SELECT 
                r.receipt_id, 
                r.purchase_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul' AS purchase_date,
                r.shop_name, 
                r.total_sum,
                json_agg(
                    json_build_object(
                        'product_name', p.product_name,
                        'quantity', ri.quantity,
                        'price', ri.price
                    )
                ) AS items
            FROM Receipts r
            LEFT JOIN ReceiptItems ri ON r.receipt_id = ri.receipt_id
            LEFT JOIN Products p ON ri.product_id = p.product_id
            WHERE r.user_id = $1
            GROUP BY r.receipt_id
            ORDER BY r.purchase_date DESC
        `, [userId]);
        res.status(200).json(receipts.rows);
    } catch (err) {
        res.status(500).send("Failed to retrieve receipts.");
    }
});

// API endpoint to delete a receipt by receipt_id
app.delete("/api/receipts/:receiptId", async (req, res) => {
    const { receiptId } = req.params;

    if (!receiptId) {
        return res.status(400).json({ message: "Receipt ID is required." });
    }

    try {
        await pool.query("DELETE FROM ReceiptItems WHERE receipt_id = $1", [receiptId]);

        const result = await pool.query("DELETE FROM Receipts WHERE receipt_id = $1 RETURNING *", [receiptId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Receipt not found." });
        }

        res.status(200).json({ message: "Receipt deleted successfully." });
    } catch (err) {
        console.error("Error deleting receipt:", err);
        res.status(500).json({ message: "Server error during receipt deletion." });
    }
});