const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const Database = require('better-sqlite3');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== BASE DE DATOS ====================
const db = new Database(path.join(process.cwd(), 'manager.db'));

// Crear tablas
db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT UNIQUE, pass TEXT);
    CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT);
    CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, precio_base REAL, stock INTEGER DEFAULT 0, stock_minimo INTEGER DEFAULT 5);
    CREATE TABLE IF NOT EXISTS ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, fecha DATETIME DEFAULT (datetime('now', '-5 hours')));
    CREATE TABLE IF NOT EXISTS detalle_ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER, producto_id INTEGER, cantidad INTEGER, precio_final REAL);
    CREATE TABLE IF NOT EXISTS pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, monto REAL, fecha_pago TEXT, observacion TEXT);
`);

// Agregar columnas de deudas
try { db.exec(`ALTER TABLE clientes ADD COLUMN total_deuda REAL DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE clientes ADD COLUMN total_pagado REAL DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE clientes ADD COLUMN ultima_deuda TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE clientes ADD COLUMN ultimo_pago TEXT`); } catch(e) {}

console.log("✅ Base de datos creada correctamente");

// Crear usuario admin si no existe
const adminExists = db.prepare("SELECT * FROM usuarios WHERE user = 'admin'").get();
if (!adminExists) {
    db.prepare("INSERT INTO usuarios (user, pass) VALUES (?, ?)").run('admin', 'admin123');
    console.log("👤 Usuario admin creado: admin / admin123");
}

// ==================== RUTAS DE AUTENTICACIÓN ====================
app.post('/api/auth/register', (req, res) => {
    const { user, pass } = req.body;
    try {
        const info = db.prepare("INSERT INTO usuarios (user, pass) VALUES (?, ?)").run(user, pass);
        res.json({ id: info.lastInsertRowid, status: "registrado" });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "El usuario ya existe" });
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { user, pass } = req.body;
    const row = db.prepare("SELECT * FROM usuarios WHERE user = ? AND pass = ?").get(user, pass);
    row ? res.json({ status: "ok", user: row.user }) : res.status(401).json({ error: "Credenciales incorrectas" });
});

// ==================== RUTAS DE CLIENTES ====================
app.get('/api/clientes', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let where = "";
    let params = [];
    if (search) {
        where = " WHERE nombre LIKE ?";
        params.push(`%${search}%`);
    }
    
    const total = db.prepare(`SELECT COUNT(*) as total FROM clientes${where}`).get(...params)?.total || 0;
    const rows = db.prepare(`SELECT * FROM clientes${where} ORDER BY nombre LIMIT ? OFFSET ?`).all(...params, limit, offset);
    
    const clientesConDatos = rows.map(cliente => {
        const stats = db.prepare(`SELECT COUNT(*) as compras, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total_gastado FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id WHERE v.cliente_id = ?`).get(cliente.id);
        return { ...cliente, compras: stats?.compras || 0, total_gastado: stats?.total_gastado || 0 };
    });
    
    res.json({ data: clientesConDatos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

app.post('/api/clientes', (req, res) => {
    const { nombre } = req.body;
    const info = db.prepare("INSERT INTO clientes (nombre) VALUES (?)").run(nombre);
    res.json({ id: info.lastInsertRowid, nombre });
});

app.put('/api/clientes/:id', (req, res) => {
    db.prepare("UPDATE clientes SET nombre = ? WHERE id = ?").run(req.body.nombre, req.params.id);
    res.json({ status: "ok" });
});

app.delete('/api/clientes/:id', (req, res) => {
    db.prepare("DELETE FROM clientes WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
});

// ==================== RUTAS DE PRODUCTOS ====================
app.get('/api/productos', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filtro = req.query.filtro || 'todos';
    
    let where = "";
    let params = [];
    
    if (search) { where += " WHERE nombre LIKE ?"; params.push(`%${search}%`); }
    if (filtro === 'bajo') where += (where ? " AND" : " WHERE") + " stock <= stock_minimo AND stock > 0";
    else if (filtro === 'agotados') where += (where ? " AND" : " WHERE") + " stock = 0";
    
    const total = db.prepare(`SELECT COUNT(*) as total FROM productos${where}`).get(...params)?.total || 0;
    const rows = db.prepare(`SELECT * FROM productos${where} ORDER BY nombre LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

app.post('/api/productos', (req, res) => {
    const { nombre, precio, stock, stock_minimo } = req.body;
    const info = db.prepare("INSERT INTO productos (nombre, precio_base, stock, stock_minimo) VALUES (?, ?, ?, ?)").run(nombre, precio, stock || 0, stock_minimo || 5);
    res.json({ id: info.lastInsertRowid });
});

app.put('/api/productos/:id', (req, res) => {
    db.prepare("UPDATE productos SET nombre = ?, precio_base = ? WHERE id = ?").run(req.body.nombre, req.body.precio, req.params.id);
    res.json({ status: "ok" });
});

app.put('/api/productos/:id/stock', (req, res) => {
    const { stock, stock_minimo } = req.body;
    if (stock !== undefined) db.prepare("UPDATE productos SET stock = ? WHERE id = ?").run(stock, req.params.id);
    if (stock_minimo !== undefined) db.prepare("UPDATE productos SET stock_minimo = ? WHERE id = ?").run(stock_minimo, req.params.id);
    res.json({ status: "ok" });
});

app.delete('/api/productos/:id', (req, res) => {
    db.prepare("DELETE FROM productos WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
});

app.get('/api/productos/stock-bajo', (req, res) => {
    const rows = db.prepare("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0 ORDER BY stock ASC").all();
    res.json(rows);
});

app.get('/api/productos/agotados', (req, res) => {
    const rows = db.prepare("SELECT * FROM productos WHERE stock = 0").all();
    res.json(rows);
});

// ==================== RUTAS DE VENTAS ====================
app.get('/api/historial', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let where = "";
    let params = [];
    if (search) { where = " WHERE c.nombre LIKE ?"; params.push(`%${search}%`); }
    
    const total = db.prepare(`SELECT COUNT(DISTINCT v.id) as total FROM ventas v JOIN clientes c ON v.cliente_id = c.id${where}`).get(...params)?.total || 0;
    const rows = db.prepare(`
        SELECT v.id, c.nombre as cliente, v.fecha, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total, COUNT(d.id) as items
        FROM ventas v JOIN clientes c ON v.cliente_id = c.id LEFT JOIN detalle_ventas d ON v.id = d.venta_id
        ${where} GROUP BY v.id ORDER BY v.fecha DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    const ventas = rows.map(v => {
        let fechaFormateada = '';
        if (v.fecha) {
            let fechaLimpia = v.fecha.toString().trim();
            if (fechaLimpia.includes(' ')) fechaLimpia = fechaLimpia.split(' ')[0];
            if (fechaLimpia.includes('-')) {
                const partes = fechaLimpia.split('-');
                fechaFormateada = `${partes[2]}/${partes[1]}/${partes[0]}`;
            } else fechaFormateada = fechaLimpia;
        }
        return { ...v, fecha: fechaFormateada, total: v.total || 0, items: v.items || 0 };
    });
    
    res.json({ data: ventas, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

app.post('/api/ventas', (req, res) => {
    const { cliente_id, items } = req.body;
    const totalVenta = items.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    
    try {
        for (const item of items) {
            const producto = db.prepare("SELECT nombre, stock FROM productos WHERE id = ?").get(item.id);
            if (!producto || producto.stock < item.cantidad) {
                return res.status(400).json({ error: `Stock insuficiente para ${producto?.nombre || 'producto'}` });
            }
        }
        
        const now = new Date();
        const colombiaDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));
        const fechaColombia = colombiaDate.toISOString().slice(0, 19).replace('T', ' ');
        
        const info = db.prepare("INSERT INTO ventas (cliente_id, fecha) VALUES (?, ?)").run(cliente_id, fechaColombia);
        const venta_id = info.lastInsertRowid;
        
        for (const item of items) {
            db.prepare("INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)").run(venta_id, item.id, item.cantidad, item.precio);
            db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ?").run(item.cantidad, item.id);
        }
        
        db.prepare(`UPDATE clientes SET total_deuda = COALESCE(total_deuda, 0) + ?, ultima_deuda = ? WHERE id = ?`).run(totalVenta, fechaColombia, cliente_id);
        
        const bajo = db.prepare("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0").all();
        const agotados = db.prepare("SELECT * FROM productos WHERE stock = 0").all();
        
        res.json({ id: venta_id, status: "venta registrada", deuda_agregada: totalVenta, alertas: { stock_bajo: bajo, agotados: agotados } });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/ventas/:id', (req, res) => {
    db.prepare("DELETE FROM detalle_ventas WHERE venta_id = ?").run(req.params.id);
    db.prepare("DELETE FROM ventas WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
});

app.get('/api/ventas/:id/detalles', (req, res) => {
    const rows = db.prepare(`SELECT d.cantidad, d.precio_final, p.nombre FROM detalle_ventas d JOIN productos p ON d.producto_id = p.id WHERE d.venta_id = ?`).all(req.params.id);
    res.json(rows);
});

app.put('/api/ventas/:id', (req, res) => {
    const ventaId = req.params.id;
    const { cliente_id, items } = req.body;
    
    try {
        for (const item of items) {
            const producto = db.prepare("SELECT nombre, stock FROM productos WHERE id = ?").get(item.id);
            if (!producto || producto.stock < item.cantidad) {
                return res.status(400).json({ error: `Stock insuficiente para ${producto?.nombre || 'producto'}` });
            }
        }
        
        const oldItems = db.prepare("SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?").all(ventaId);
        for (const oldItem of oldItems) {
            db.prepare("UPDATE productos SET stock = stock + ? WHERE id = ?").run(oldItem.cantidad, oldItem.producto_id);
        }
        
        db.prepare("DELETE FROM detalle_ventas WHERE venta_id = ?").run(ventaId);
        
        for (const item of items) {
            db.prepare("INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)").run(ventaId, item.id, item.cantidad, item.precio);
            db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ?").run(item.cantidad, item.id);
        }
        
        db.prepare("UPDATE ventas SET fecha = CURRENT_TIMESTAMP WHERE id = ?").run(ventaId);
        
        const bajo = db.prepare("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0").all();
        const agotados = db.prepare("SELECT * FROM productos WHERE stock = 0").all();
        
        res.json({ id: ventaId, status: "venta actualizada", alertas: { stock_bajo: bajo, agotados: agotados } });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ==================== RUTAS ESTADÍSTICAS ====================
app.get('/api/estadisticas', (req, res) => {
    const now = new Date();
    const colombiaDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const todayColombia = colombiaDate.toISOString().slice(0, 10);
    const currentMonth = colombiaDate.toISOString().slice(5, 7);
    const currentYear = colombiaDate.toISOString().slice(0, 4);
    
    const ventas7Dias = db.prepare(`
        SELECT date(v.fecha) as fecha, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE date(v.fecha) >= date(?, '-7 days')
        GROUP BY date(v.fecha) ORDER BY fecha ASC
    `).all(todayColombia);
    
    const productosTop = db.prepare(`
        SELECT p.nombre, COALESCE(SUM(d.cantidad), 0) as cantidad, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM detalle_ventas d JOIN productos p ON d.producto_id = p.id
        GROUP BY d.producto_id ORDER BY cantidad DESC LIMIT 5
    `).all();
    
    const ventasMes = db.prepare(`
        SELECT COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE strftime('%m', v.fecha) = ? AND strftime('%Y', v.fecha) = ?
    `).get(currentMonth, currentYear)?.total || 0;
    
    const ventasHoy = db.prepare(`
        SELECT COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE date(v.fecha) = ?
    `).get(todayColombia)?.total || 0;
    
    const mejoresClientes = db.prepare(`
        SELECT c.nombre, COUNT(DISTINCT v.id) as compras, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM clientes c LEFT JOIN ventas v ON c.id = v.cliente_id LEFT JOIN detalle_ventas d ON v.id = d.venta_id
        GROUP BY c.id ORDER BY total DESC LIMIT 5
    `).all();
    
    res.json({ ventas7Dias, productosTop, ventasMes, ventasHoy, mejoresClientes });
});

// ==================== RUTAS CUENTAS POR COBRAR ====================
app.get('/api/deudores', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filtro = req.query.filtro || 'todos';
    
    let where = "";
    let params = [];
    if (search) { where += " AND c.nombre LIKE ?"; params.push(`%${search}%`); }
    if (filtro === 'morosos') where += " AND COALESCE(c.total_deuda, 0) > COALESCE(c.total_pagado, 0)";
    else if (filtro === 'pagados') where += " AND COALESCE(c.total_deuda, 0) <= COALESCE(c.total_pagado, 0)";
    
    const total = db.prepare(`SELECT COUNT(*) as total FROM clientes c WHERE 1=1${where}`).get(...params)?.total || 0;
    const rows = db.prepare(`
        SELECT c.id, c.nombre, COALESCE(c.total_deuda, 0) as total_deuda, COALESCE(c.total_pagado, 0) as total_pagado,
               CASE WHEN c.ultima_deuda IS NOT NULL THEN julianday('now') - julianday(c.ultima_deuda) ELSE 0 END as dias_vencidos,
               c.ultimo_pago
        FROM clientes c WHERE 1=1${where}
        ORDER BY (COALESCE(c.total_deuda, 0) - COALESCE(c.total_pagado, 0)) DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

app.post('/api/registrar-pago', (req, res) => {
    const { cliente_id, monto, fecha, observacion } = req.body;
    if (!cliente_id || !monto || monto <= 0 || !fecha) return res.status(400).json({ error: 'Datos incompletos' });
    
    db.prepare("INSERT INTO pagos (cliente_id, monto, fecha_pago, observacion) VALUES (?, ?, ?, ?)").run(cliente_id, monto, fecha, observacion || '');
    db.prepare("UPDATE clientes SET total_pagado = COALESCE(total_pagado, 0) + ?, ultimo_pago = ? WHERE id = ?").run(monto, fecha, cliente_id);
    res.json({ success: true });
});

app.post('/api/registrar-deuda-manual', (req, res) => {
    const { cliente_id, monto, fecha } = req.body;
    if (!cliente_id || !monto || monto <= 0 || !fecha) return res.status(400).json({ error: 'Datos incompletos' });
    
    db.prepare("UPDATE clientes SET total_deuda = COALESCE(total_deuda, 0) + ?, ultima_deuda = ? WHERE id = ?").run(monto, fecha, cliente_id);
    res.json({ success: true });
});

app.put('/api/ajustar-deuda/:id', (req, res) => {
    const { total_deuda } = req.body;
    if (total_deuda === undefined || total_deuda < 0) return res.status(400).json({ error: 'Monto inválido' });
    
    db.prepare("UPDATE clientes SET total_deuda = ? WHERE id = ?").run(total_deuda, req.params.id);
    res.json({ success: true });
});

app.get('/api/historial-pagos/:clienteId', (req, res) => {
    const rows = db.prepare("SELECT * FROM pagos WHERE cliente_id = ? ORDER BY fecha_pago DESC").all(req.params.clienteId);
    res.json(rows);
});

app.get('/api/total-pagos', (req, res) => {
    const row = db.prepare("SELECT COALESCE(SUM(monto), 0) as total FROM pagos").get();
    res.json({ total: row?.total || 0 });
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