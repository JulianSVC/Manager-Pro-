const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== BASE DE DATOS ====================
const db = new sqlite3.Database(path.join(process.cwd(), 'manager.db'));

db.serialize(() => {
    // Crear tablas
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        user TEXT UNIQUE, 
        pass TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        nombre TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        nombre TEXT, 
        precio_base REAL,
        stock INTEGER DEFAULT 0,
        stock_minimo INTEGER DEFAULT 5
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        cliente_id INTEGER, 
        fecha DATETIME DEFAULT (datetime('now', '-5 hours'))
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS detalle_ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        venta_id INTEGER, 
        producto_id INTEGER, 
        cantidad INTEGER, 
        precio_final REAL
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        monto REAL,
        fecha_pago TEXT,
        observacion TEXT
    )`);
    
    // Agregar columnas de deudas
    db.run(`ALTER TABLE clientes ADD COLUMN total_deuda REAL DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE clientes ADD COLUMN total_pagado REAL DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE clientes ADD COLUMN ultima_deuda TEXT`, (err) => {});
    db.run(`ALTER TABLE clientes ADD COLUMN ultimo_pago TEXT`, (err) => {});
    
    console.log("✅ Base de datos creada correctamente");
    
    // Crear usuario admin si no existe
    db.get("SELECT * FROM usuarios WHERE user = 'admin'", [], (err, row) => {
        if (!row) {
            db.run("INSERT INTO usuarios (user, pass) VALUES (?, ?)", ['admin', 'admin123']);
            console.log("👤 Usuario admin creado: admin / admin123");
        }
    });
});

// ==================== RUTAS DE AUTENTICACIÓN ====================
app.post('/api/auth/register', (req, res) => {
    const { user, pass } = req.body;
    db.run("INSERT INTO usuarios (user, pass) VALUES (?, ?)", [user, pass], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "El usuario ya existe" });
            return res.status(400).json({ error: err.message });
        }
        res.json({ id: this.lastID, status: "registrado" });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { user, pass } = req.body;
    db.get("SELECT * FROM usuarios WHERE user = ? AND pass = ?", [user, pass], (err, row) => {
        if (row) {
            res.json({ status: "ok", user: row.user });
        } else {
            res.status(401).json({ error: "Credenciales incorrectas" });
        }
    });
});

// ==================== RUTAS DE CLIENTES ====================
app.get('/api/clientes', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let query = "SELECT * FROM clientes";
    let countQuery = "SELECT COUNT(*) as total FROM clientes";
    let params = [];
    
    if (search) {
        query += " WHERE nombre LIKE ?";
        countQuery += " WHERE nombre LIKE ?";
        params.push(`%${search}%`);
    }
    
    query += " ORDER BY nombre LIMIT ? OFFSET ?";
    
    db.get(countQuery, params, (err, countResult) => {
        const total = countResult?.total || 0;
        
        db.all(query, [...params, limit, offset], (err, rows) => {
            const clientesPromises = rows.map(cliente => {
                return new Promise((resolve) => {
                    db.get(`
                        SELECT COUNT(*) as compras, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total_gastado
                        FROM ventas v
                        LEFT JOIN detalle_ventas d ON v.id = d.venta_id
                        WHERE v.cliente_id = ?
                    `, [cliente.id], (err, stats) => {
                        resolve({ ...cliente, compras: stats?.compras || 0, total_gastado: stats?.total_gastado || 0 });
                    });
                });
            });
            
            Promise.all(clientesPromises).then(clientesConDatos => {
                res.json({ data: clientesConDatos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
            });
        });
    });
});

app.post('/api/clientes', (req, res) => {
    const { nombre } = req.body;
    db.run("INSERT INTO clientes (nombre) VALUES (?)", [nombre], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, nombre });
    });
});

app.put('/api/clientes/:id', (req, res) => {
    db.run("UPDATE clientes SET nombre = ? WHERE id = ?", [req.body.nombre, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

app.delete('/api/clientes/:id', (req, res) => {
    db.run("DELETE FROM clientes WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

// ==================== RUTAS DE PRODUCTOS ====================
app.get('/api/productos', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filtro = req.query.filtro || 'todos';
    
    let query = "SELECT * FROM productos";
    let countQuery = "SELECT COUNT(*) as total FROM productos";
    let params = [];
    let whereConditions = [];
    
    if (search) {
        whereConditions.push("nombre LIKE ?");
        params.push(`%${search}%`);
    }
    if (filtro === 'bajo') {
        whereConditions.push("stock <= stock_minimo AND stock > 0");
    } else if (filtro === 'agotados') {
        whereConditions.push("stock = 0");
    }
    
    if (whereConditions.length > 0) {
        const whereClause = " WHERE " + whereConditions.join(" AND ");
        query += whereClause;
        countQuery += whereClause;
    }
    
    query += " ORDER BY nombre LIMIT ? OFFSET ?";
    
    db.get(countQuery, params, (err, countResult) => {
        const total = countResult?.total || 0;
        
        db.all(query, [...params, limit, offset], (err, rows) => {
            res.json({ data: rows || [], pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
        });
    });
});

app.post('/api/productos', (req, res) => {
    const { nombre, precio, stock, stock_minimo } = req.body;
    db.run("INSERT INTO productos (nombre, precio_base, stock, stock_minimo) VALUES (?, ?, ?, ?)", 
        [nombre, precio, stock || 0, stock_minimo || 5], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/productos/:id', (req, res) => {
    db.run("UPDATE productos SET nombre = ?, precio_base = ? WHERE id = ?", 
        [req.body.nombre, req.body.precio, req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ status: "ok" });
        });
});

app.put('/api/productos/:id/stock', (req, res) => {
    const { stock, stock_minimo } = req.body;
    if (stock !== undefined) {
        db.run("UPDATE productos SET stock = ? WHERE id = ?", [stock, req.params.id]);
    }
    if (stock_minimo !== undefined) {
        db.run("UPDATE productos SET stock_minimo = ? WHERE id = ?", [stock_minimo, req.params.id]);
    }
    res.json({ status: "ok" });
});

app.delete('/api/productos/:id', (req, res) => {
    db.run("DELETE FROM productos WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

app.get('/api/productos/stock-bajo', (req, res) => {
    db.all("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0 ORDER BY stock ASC", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/productos/agotados', (req, res) => {
    db.all("SELECT * FROM productos WHERE stock = 0", [], (err, rows) => {
        res.json(rows || []);
    });
});

// ==================== RUTAS DE VENTAS ====================
app.get('/api/historial', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let countQuery = `SELECT COUNT(DISTINCT v.id) as total FROM ventas v JOIN clientes c ON v.cliente_id = c.id`;
    let countParams = [];
    if (search) {
        countQuery += ` WHERE c.nombre LIKE ?`;
        countParams.push(`%${search}%`);
    }
    
    let query = `
        SELECT v.id, c.nombre as cliente, v.fecha, 
               COALESCE(SUM(d.cantidad * d.precio_final), 0) as total,
               COUNT(d.id) as items
        FROM ventas v
        JOIN clientes c ON v.cliente_id = c.id
        LEFT JOIN detalle_ventas d ON v.id = d.venta_id
    `;
    let queryParams = [];
    if (search) {
        query += ` WHERE c.nombre LIKE ?`;
        queryParams.push(`%${search}%`);
    }
    query += ` GROUP BY v.id ORDER BY v.fecha DESC LIMIT ? OFFSET ?`;
    
    db.get(countQuery, countParams, (err, countResult) => {
        const total = countResult?.total || 0;
        
        db.all(query, [...queryParams, limit, offset], (err, rows) => {
            const ventas = (rows || []).map(v => ({
                ...v,
                fecha: v.fecha ? v.fecha.split(' ')[0].split('-').reverse().join('/') : '',
                total: v.total || 0,
                items: v.items || 0
            }));
            res.json({ data: ventas, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
        });
    });
});

app.post('/api/ventas', (req, res) => {
    const { cliente_id, items } = req.body;
    const totalVenta = items.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    
    const checkStock = items.map(item => {
        return new Promise((resolve, reject) => {
            db.get("SELECT nombre, stock FROM productos WHERE id = ?", [item.id], (err, row) => {
                if (err) reject(err);
                if (!row || row.stock < item.cantidad) {
                    reject(new Error(`Stock insuficiente para ${row?.nombre || 'producto'}`));
                }
                resolve();
            });
        });
    });
    
    Promise.all(checkStock).then(() => {
        const now = new Date();
        const colombiaDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));
        const fechaColombia = colombiaDate.toISOString().slice(0, 19).replace('T', ' ');
        
        db.run("INSERT INTO ventas (cliente_id, fecha) VALUES (?, ?)", [cliente_id, fechaColombia], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const venta_id = this.lastID;
            items.forEach(item => {
                db.run("INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)", 
                    [venta_id, item.id, item.cantidad, item.precio]);
                db.run("UPDATE productos SET stock = stock - ? WHERE id = ?", [item.cantidad, item.id]);
            });
            
            db.run(`UPDATE clientes SET total_deuda = COALESCE(total_deuda, 0) + ?, ultima_deuda = ? WHERE id = ?`,
                [totalVenta, fechaColombia, cliente_id]);
            
            db.all("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0", [], (err, bajo) => {
                db.all("SELECT * FROM productos WHERE stock = 0", [], (err, agotados) => {
                    res.json({ id: venta_id, status: "venta registrada", deuda_agregada: totalVenta, alertas: { stock_bajo: bajo || [], agotados: agotados || [] } });
                });
            });
        });
    }).catch(err => {
        res.status(400).json({ error: err.message });
    });
});

app.delete('/api/ventas/:id', (req, res) => {
    db.run("DELETE FROM detalle_ventas WHERE venta_id = ?", [req.params.id]);
    db.run("DELETE FROM ventas WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

app.get('/api/ventas/:id/detalles', (req, res) => {
    db.all(`SELECT d.cantidad, d.precio_final, p.nombre FROM detalle_ventas d JOIN productos p ON d.producto_id = p.id WHERE d.venta_id = ?`, 
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.put('/api/ventas/:id', (req, res) => {
    const ventaId = req.params.id;
    const { cliente_id, items } = req.body;
    
    const checkStock = items.map(item => {
        return new Promise((resolve, reject) => {
            db.get("SELECT nombre, stock FROM productos WHERE id = ?", [item.id], (err, row) => {
                if (err) reject(err);
                if (!row || row.stock < item.cantidad) {
                    reject(new Error(`Stock insuficiente para ${row?.nombre || 'producto'}`));
                }
                resolve();
            });
        });
    });
    
    Promise.all(checkStock).then(() => {
        db.all("SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?", [ventaId], (err, oldItems) => {
            oldItems.forEach(oldItem => {
                db.run("UPDATE productos SET stock = stock + ? WHERE id = ?", [oldItem.cantidad, oldItem.producto_id]);
            });
            
            db.run("DELETE FROM detalle_ventas WHERE venta_id = ?", [ventaId]);
            
            items.forEach(item => {
                db.run("INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)", 
                    [ventaId, item.id, item.cantidad, item.precio]);
                db.run("UPDATE productos SET stock = stock - ? WHERE id = ?", [item.cantidad, item.id]);
            });
            
            db.run("UPDATE ventas SET fecha = CURRENT_TIMESTAMP WHERE id = ?", [ventaId]);
            
            db.all("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0", [], (err, bajo) => {
                db.all("SELECT * FROM productos WHERE stock = 0", [], (err, agotados) => {
                    res.json({ id: ventaId, status: "venta actualizada", alertas: { stock_bajo: bajo || [], agotados: agotados || [] } });
                });
            });
        });
    }).catch(err => {
        res.status(400).json({ error: err.message });
    });
});

// ==================== RUTAS ESTADÍSTICAS ====================
app.get('/api/estadisticas', (req, res) => {
    const now = new Date();
    const colombiaDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const todayColombia = colombiaDate.toISOString().slice(0, 10);
    const currentMonth = colombiaDate.toISOString().slice(5, 7);
    const currentYear = colombiaDate.toISOString().slice(0, 4);
    
    db.all(`
        SELECT date(v.fecha) as fecha, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE date(v.fecha) >= date(?, '-7 days')
        GROUP BY date(v.fecha) ORDER BY fecha ASC
    `, [todayColombia], (err, ventas7Dias) => {
        
        db.all(`
            SELECT p.nombre, COALESCE(SUM(d.cantidad), 0) as cantidad, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
            FROM detalle_ventas d JOIN productos p ON d.producto_id = p.id
            GROUP BY d.producto_id ORDER BY cantidad DESC LIMIT 5
        `, [], (err, productosTop) => {
            
            db.get(`
                SELECT COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
                FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id
                WHERE strftime('%m', v.fecha) = ? AND strftime('%Y', v.fecha) = ?
            `, [currentMonth, currentYear], (err, ventasMes) => {
                
                db.get(`
                    SELECT COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
                    FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id
                    WHERE date(v.fecha) = ?
                `, [todayColombia], (err, ventasHoy) => {
                    
                    db.all(`
                        SELECT c.nombre, COUNT(DISTINCT v.id) as compras, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
                        FROM clientes c LEFT JOIN ventas v ON c.id = v.cliente_id LEFT JOIN detalle_ventas d ON v.id = d.venta_id
                        GROUP BY c.id ORDER BY total DESC LIMIT 5
                    `, [], (err, mejoresClientes) => {
                        res.json({ ventas7Dias: ventas7Dias || [], productosTop: productosTop || [], ventasMes: ventasMes?.total || 0, ventasHoy: ventasHoy?.total || 0, mejoresClientes: mejoresClientes || [] });
                    });
                });
            });
        });
    });
});

// ==================== RUTAS CUENTAS POR COBRAR ====================
app.get('/api/deudores', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filtro = req.query.filtro || 'todos';
    
    let query = `SELECT c.id, c.nombre, COALESCE(c.total_deuda, 0) as total_deuda, COALESCE(c.total_pagado, 0) as total_pagado, c.ultimo_pago FROM clientes c WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM clientes c WHERE 1=1`;
    let params = [];
    
    if (search) {
        query += ` AND c.nombre LIKE ?`;
        countQuery += ` AND c.nombre LIKE ?`;
        params.push(`%${search}%`);
    }
    if (filtro === 'morosos') {
        query += ` AND COALESCE(c.total_deuda, 0) > COALESCE(c.total_pagado, 0)`;
        countQuery += ` AND COALESCE(c.total_deuda, 0) > COALESCE(c.total_pagado, 0)`;
    } else if (filtro === 'pagados') {
        query += ` AND COALESCE(c.total_deuda, 0) <= COALESCE(c.total_pagado, 0)`;
        countQuery += ` AND COALESCE(c.total_deuda, 0) <= COALESCE(c.total_pagado, 0)`;
    }
    
    query += ` ORDER BY (COALESCE(c.total_deuda, 0) - COALESCE(c.total_pagado, 0)) DESC LIMIT ? OFFSET ?`;
    
    db.get(countQuery, params, (err, countResult) => {
        const total = countResult?.total || 0;
        
        db.all(query, [...params, limit, offset], (err, rows) => {
            res.json({ data: rows || [], pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
        });
    });
});

app.post('/api/registrar-pago', (req, res) => {
    const { cliente_id, monto, fecha, observacion } = req.body;
    if (!cliente_id || !monto || monto <= 0 || !fecha) return res.status(400).json({ error: 'Datos incompletos' });
    
    db.run("INSERT INTO pagos (cliente_id, monto, fecha_pago, observacion) VALUES (?, ?, ?, ?)", 
        [cliente_id, monto, fecha, observacion || ''], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run("UPDATE clientes SET total_pagado = COALESCE(total_pagado, 0) + ?, ultimo_pago = ? WHERE id = ?", 
                [monto, fecha, cliente_id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                });
        });
});

app.post('/api/registrar-deuda-manual', (req, res) => {
    const { cliente_id, monto, fecha } = req.body;
    if (!cliente_id || !monto || monto <= 0 || !fecha) return res.status(400).json({ error: 'Datos incompletos' });
    
    db.run("UPDATE clientes SET total_deuda = COALESCE(total_deuda, 0) + ?, ultima_deuda = ? WHERE id = ?", 
        [monto, fecha, cliente_id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.put('/api/ajustar-deuda/:id', (req, res) => {
    const { total_deuda } = req.body;
    if (total_deuda === undefined || total_deuda < 0) return res.status(400).json({ error: 'Monto inválido' });
    
    db.run("UPDATE clientes SET total_deuda = ? WHERE id = ?", [total_deuda, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/historial-pagos/:clienteId', (req, res) => {
    db.all("SELECT * FROM pagos WHERE cliente_id = ? ORDER BY fecha_pago DESC", [req.params.clienteId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/total-pagos', (req, res) => {
    db.get("SELECT COALESCE(SUM(monto), 0) as total FROM pagos", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ total: row?.total || 0 });
    });
});

// ==================== RUTA PRINCIPAL ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3011;
app.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------------');
    console.log(`🚀 Manager Pro corriendo en:`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log('-----------------------------------------');
});