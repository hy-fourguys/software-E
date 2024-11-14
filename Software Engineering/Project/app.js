document.addEventListener('DOMContentLoaded', () => {
    const outputElement = document.getElementById('output');

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#scanner-container'),
            constraints: {
                width: 640,
                height: 480,
                facingMode: "environment" // Use rear camera
            }
        },
        decoder: {
            readers: ["code_128_reader", "ean_reader", "ean_8_reader", "upc_reader"] // Specify types of barcodes
        }
    }, (err) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log("Initialization finished. Ready to start");
        Quagga.start();
    });

    Quagga.onDetected(async (data) => {
        const code = data.codeResult.code;
        try {
            const response = await fetch(`http://localhost:3000/product/${code}`);
            if (response.ok) {
                const product = await response.json();
                outputElement.textContent = `Product found: ${product.name} - ${product.description}`;
            } else {
                outputElement.textContent = `Product not found for barcode: ${code}`;
            }
        } catch (error) {
            console.error('Error fetching product:', error);
            outputElement.textContent = 'Error retrieving product information';
        }
    });
});
