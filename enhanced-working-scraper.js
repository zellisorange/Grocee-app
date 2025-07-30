// enhance-working-scraper.js - Simple enhancement for your working scraper
const express = require('express');
const cors = require('cors');

console.log('🚀 Enhanced Grocee Starting...');

class EnhancedGroceeAPI {
    constructor() {
        this.app = express();
        this.port = 3001;
        
        // Revenue tracking
        this.stats = {
            apiCalls: 0,
            searches: 0,
            revenue: 0
        };

        // Canadian products data
        this.canadianProducts = {
            bananas: [
                { name: 'Bananas, per lb', price: 1.47, store: 'Metro' },
                { name: 'Organic Bananas, 2 lb', price: 4.47, store: 'Sobeys' },
                { name: 'Bananas, 3 lb bag', price: 2.97, store: 'Walmart' }
            ],
            milk: [
                { name: '2% Milk, 2L', price: 3.97, store: 'Metro' },
                { name: 'Whole Milk, 2L', price: 4.17, store: 'Sobeys' },
                { name: 'Organic Milk, 2L', price: 5.47, store: 'Walmart' }
            ],
            bread: [
                { name: 'White Bread, 675g', price: 2.97, store: 'Metro' },
                { name: 'Whole Wheat Bread', price: 3.47, store: 'Sobeys' }
            ]
        };

        this.setupAPI();
    }

    setupAPI() {
        this.app.use(cors());
        this.app.use(express.json());

        // Search endpoint
        this.app.get('/api/search/:query', (req, res) => {
            const { query } = req.params;
            this.stats.apiCalls++;
            this.stats.searches++;
            this.stats.revenue += 0.10;
            
            console.log(`🔍 Search: ${query}`);
            const results = this.searchProducts(query);
            
            res.json({
                success: true,
                query,
                totalResults: results.length,
                products: results,
                stats: this.stats
            });
        });

        // Revenue endpoint
        this.app.get('/api/revenue', (req, res) => {
            res.json({
                success: true,
                revenue: this.stats,
                estimatedMonthly: (this.stats.revenue * 30).toFixed(2)
            });
        });

        // Test endpoint
        this.app.get('/api/test', (req, res) => {
            res.json({
                success: true,
                message: 'Enhanced Grocee API is working!',
                timestamp: new Date().toISOString()
            });
        });
    }

    searchProducts(query) {
        const queryLower = query.toLowerCase();
        const results = [];

        for (const [category, products] of Object.entries(this.canadianProducts)) {
            if (queryLower.includes(category) || category.includes(queryLower)) {
                products.forEach(product => {
                    results.push({
                        name: product.name,
                        price: product.price,
                        priceText: `$${product.price.toFixed(2)}`,
                        store: product.store,
                        category: category
                    });
                });
            }
        }

        return results;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log('🍁 ENHANCED GROCEE API STARTED!');
            console.log(`📡 Server: http://localhost:${this.port}`);
            console.log('🔥 Endpoints:');
            console.log('   GET /api/search/bananas');
            console.log('   GET /api/revenue');
            console.log('   GET /api/test');
            console.log('💰 Revenue tracking: ACTIVE');
        });
    }
}

// Start the enhanced API
const api = new EnhancedGroceeAPI();
api.start();
