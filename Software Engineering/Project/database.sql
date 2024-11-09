CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

-- Insert 10 sample products
INSERT INTO products (barcode, name, description) VALUES
('123456789012', 'Product 1', 'Description of Product 1'),
('234567890123', 'Product 2', 'Description of Product 2'),
('345678901234', 'Product 3', 'Description of Product 3'),
('456789012345', 'Product 4', 'Description of Product 4'),
('567890123456', 'Product 5', 'Description of Product 5'),
('678901234567', 'Product 6', 'Description of Product 6'),
('789012345678', 'Product 7', 'Description of Product 7'),
('890123456789', 'Product 8', 'Description of Product 8'),
('901234567890', 'Product 9', 'Description of Product 9'),
('012345678901', 'Product 10', 'Description of Product 10'),
('4987035676911', 'Product 11', 'Chocolat Bar');
