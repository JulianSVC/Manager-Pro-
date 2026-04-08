const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();
app.use(bodyParser.json());

// ==================== SISTEMA DE LICENCIAS ====================
const LICENCIA_SECRETA = 'MANAGER_PRO_2024_CLAVE_SECRETA';
// Usar la carpeta del usuario para guardar la licencia
const LICENCIA_FILE = path.join(process.cwd(), 'license.key');

function getHardwareId() {
    try {
        const cpus = os.cpus();
        const networkInterfaces = os.networkInterfaces();
        
        let macAddress = 'NO-MAC';
        const interfaces = networkInterfaces;
        
        for (let iface in interfaces) {
            if (interfaces[iface] && interfaces[iface][0] && interfaces[iface][0].mac) {
                macAddress = interfaces[iface][0].mac;
                break;
            }
        }

        const hardwareData = [
            os.hostname(),
            cpus[0]?.model || 'CPU-UNKNOWN',
            cpus.length,
            os.totalmem(),
            macAddress,
            os.platform(),
            os.release()
        ].join('|');

        return crypto.createHash('sha256').update(hardwareData).digest('hex');
    } catch (error) {
        console.error('Error generando hardware ID:', error);
        return null;
    }
}

function validarLicencia() {
    try {
        if (!fs.existsSync(LICENCIA_FILE)) {
            return { valida: false, mensaje: 'Archivo de licencia no encontrado' };
        }

        const licenciaGuardada = fs.readFileSync(LICENCIA_FILE, 'utf8').trim();
        const hardwareId = getHardwareId();
        
        if (!hardwareId) {
            return { valida: false, mensaje: 'No se pudo identificar el hardware' };
        }

        const licenciaEsperada = crypto
            .createHash('sha256')
            .update(LICENCIA_SECRETA + '_' + hardwareId)
            .digest('hex')
            .substring(0, 20)
            .toUpperCase();

        return { 
            valida: licenciaGuardada === licenciaEsperada,
            mensaje: licenciaGuardada === licenciaEsperada ? 'Licencia válida' : 'Licencia no válida para este equipo'
        };
    } catch (error) {
        return { valida: false, mensaje: 'Error validando licencia' };
    }
}

// Endpoints públicos
app.post('/api/activar', express.json(), (req, res) => {
    const { licencia } = req.body;
    
    if (!licencia) {
        return res.status(400).json({ error: 'Licencia requerida' });
    }

    const hardwareId = getHardwareId();
    if (!hardwareId) {
        return res.status(500).json({ error: 'Error identificando hardware' });
    }

    const licenciaEsperada = crypto
        .createHash('sha256')
        .update(LICENCIA_SECRETA + '_' + hardwareId)
        .digest('hex')
        .substring(0, 20)
        .toUpperCase();

    if (licencia === licenciaEsperada) {
        fs.writeFileSync(LICENCIA_FILE, licencia);
        res.json({ activado: true, mensaje: 'Software activado correctamente' });
    } else {
        res.status(400).json({ error: 'Licencia no válida para este equipo' });
    }
});

app.get('/api/hardware-id', (req, res) => {
    const hwid = getHardwareId();
    if (hwid) {
        res.json({ hardware_id: hwid });
    } else {
        res.status(500).json({ error: 'No se pudo obtener HWID' });
    }
});

app.get('/api/verificar-licencia', (req, res) => {
    const resultado = validarLicencia();
    res.json(resultado);
});

app.post('/api/generar-licencia-para-cliente', (req, res) => {
    const { clave_secreta, hardware_id_cliente } = req.body;
    
    if (clave_secreta !== 'ADMIN_2024') {
        return res.status(401).json({ error: 'No autorizado' });
    }
    
    if (!hardware_id_cliente) {
        return res.status(400).json({ error: 'Hardware ID del cliente requerido' });
    }
    
    const licencia = crypto
        .createHash('sha256')
        .update(LICENCIA_SECRETA + '_' + hardware_id_cliente)
        .digest('hex')
        .substring(0, 20)
        .toUpperCase();
    
    res.json({ 
        licencia,
        hardware_id: hardware_id_cliente,
        mensaje: 'Licencia generada correctamente'
    });
});

// ==================== VERIFICACIÓN DE LICENCIA ====================
const licenciaValida = validarLicencia();

if (!licenciaValida.valida) {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         MANAGER PRO - SOFTWARE NO ACTIVADO        ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    console.log(`📋 HWID: ${getHardwareId()}`);
    console.log('\n📱 WhatsApp: +57 312 345 6789');
    console.log('📧 Email: ventas@managerpro.co\n');
    
    app.use(express.static(path.join(__dirname, 'public')));
    
    app.use((req, res, next) => {
        const rutasPermitidas = [
            '/activar.html',
            '/favicon.ico',
            '/api/hardware-id',
            '/api/activar',
            '/api/verificar-licencia',
            '/api/generar-licencia-para-cliente'
        ];
        
        if (rutasPermitidas.includes(req.path) || req.path.startsWith('/api/')) {
            return next();
        }
        
        res.sendFile(path.join(__dirname, 'public', 'activar.html'));
    });

} else {
    console.log('✅ Licencia válida - Software activado');
    
    app.use(express.static(path.join(__dirname, 'public')));
    
// Guardar DB en la carpeta actual de trabajo
const db = new sqlite3.Database(path.join(process.cwd(), 'manager.db'));

    db.serialize(() => {
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
        
        console.log("✅ Base de datos creada correctamente");
    });

    // ==================== RUTAS DE AUTENTICACIÓN ====================
    app.post('/api/auth/register', (req, res) => {
        const { user, pass } = req.body;
        
        db.run(
            "INSERT INTO usuarios (user, pass) VALUES (?, ?)", 
            [user, pass], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: "El usuario ya existe" });
                    }
                    return res.status(400).json({ error: err.message });
                }
                res.json({ id: this.lastID, status: "registrado" });
            }
        );
    });

    app.post('/api/auth/login', (req, res) => {
        const { user, pass } = req.body;
        
        db.get(
            "SELECT * FROM usuarios WHERE user = ? AND pass = ?", 
            [user, pass], 
            (err, row) => {
                if (row) {
                    res.json({ status: "ok", user: row.user });
                } else {
                    res.status(401).json({ error: "Credenciales incorrectas" });
                }
            }
        );
    });
    // ==================== RUTAS PARA CUENTAS POR COBRAR ====================

// Agregar columnas a la tabla clientes (con verificación)
const agregarColumna = (columna, tipo, defecto = null) => {
    let sql = `ALTER TABLE clientes ADD COLUMN ${columna} ${tipo}`;
    if (defecto !== null) sql += ` DEFAULT ${defecto}`;
    db.run(sql, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log(`⚠️ Error agregando ${columna}:`, err.message);
        } else if (!err) {
            console.log(`✅ Columna ${columna} agregada`);
        }
    });
};

agregarColumna('total_deuda', 'REAL', 0);
agregarColumna('total_pagado', 'REAL', 0);
agregarColumna('ultima_deuda', 'TEXT');
agregarColumna('ultimo_pago', 'TEXT');

// Crear tabla de pagos
db.run(`CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    monto REAL,
    fecha_pago TEXT,
    observacion TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
)`, (err) => {
    if (err) console.log('❌ Error:', err.message);
    else console.log('✅ Tabla pagos lista');
});

// Obtener deudores con paginación
app.get('/api/deudores', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filtro = req.query.filtro || 'todos';
    
    let query = `
        SELECT c.id, c.nombre, 
               COALESCE(c.total_deuda, 0) as total_deuda,
               COALESCE(c.total_pagado, 0) as total_pagado,
               CASE 
                   WHEN c.ultima_deuda IS NOT NULL 
                   THEN julianday('now') - julianday(c.ultima_deuda) 
                   ELSE 0 
               END as dias_vencidos,
               c.ultimo_pago
        FROM clientes c
        WHERE 1=1
    `;
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
        if (err) return res.status(500).json({ error: err.message });
        
        const total = countResult?.total || 0;
        
        db.all(query, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({
                data: rows || [],
                pagination: {
                    page, limit, total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        });
    });
});

// Registrar pago
app.post('/api/registrar-pago', (req, res) => {
    const { cliente_id, monto, fecha, observacion } = req.body;
    
    if (!cliente_id || !monto || monto <= 0 || !fecha) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    db.serialize(() => {
        db.run(`INSERT INTO pagos (cliente_id, monto, fecha_pago, observacion) VALUES (?, ?, ?, ?)`,
            [cliente_id, monto, fecha, observacion || ''],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                db.run(`UPDATE clientes SET total_pagado = COALESCE(total_pagado, 0) + ?, ultimo_pago = ? WHERE id = ?`,
                    [monto, fecha, cliente_id],
                    (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true, message: 'Pago registrado' });
                    });
            });
    });
});

// Registrar deuda manual
app.post('/api/registrar-deuda-manual', (req, res) => {
    const { cliente_id, monto, fecha, descripcion } = req.body;
    
    if (!cliente_id || !monto || monto <= 0 || !fecha) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    db.run(`UPDATE clientes SET total_deuda = COALESCE(total_deuda, 0) + ?, ultima_deuda = ? WHERE id = ?`,
        [monto, fecha, cliente_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Deuda registrada' });
        });
});

// Ajustar deuda manualmente
app.put('/api/ajustar-deuda/:id', (req, res) => {
    const { id } = req.params;
    const { total_deuda } = req.body;
    
    if (total_deuda === undefined || total_deuda < 0) {
        return res.status(400).json({ error: 'Monto inválido' });
    }
    
    db.run(`UPDATE clientes SET total_deuda = ? WHERE id = ?`,
        [total_deuda, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Deuda actualizada' });
        });
});

// Obtener historial de pagos de un cliente
app.get('/api/historial-pagos/:clienteId', (req, res) => {
    const { clienteId } = req.params;
    
    db.all(`SELECT * FROM pagos WHERE cliente_id = ? ORDER BY fecha_pago DESC`,
        [clienteId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});
app.get('/api/total-pagos', (req, res) => {
    db.get(`SELECT COALESCE(SUM(monto), 0) as total FROM pagos`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ total: row?.total || 0 });
    });
});
    // ==================== RUTAS DE CLIENTES CON DATOS DE COMPRAS ====================
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
        
        db.get(countQuery, params.slice(0, params.length), (err, countResult) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const total = countResult?.total || 0;
            
            db.all(query, [...params, limit, offset], (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                const clientesPromises = rows.map(cliente => {
                    return new Promise((resolve, reject) => {
                        db.get(`
                            SELECT COUNT(*) as compras, COALESCE(SUM(d.cantidad * d.precio_final), 0) as total_gastado
                            FROM ventas v
                            JOIN detalle_ventas d ON v.id = d.venta_id
                            WHERE v.cliente_id = ?
                        `, [cliente.id], (err, stats) => {
                            if (err) reject(err);
                            else resolve({
                                ...cliente,
                                compras: stats?.compras || 0,
                                total_gastado: stats?.total_gastado || 0
                            });
                        });
                    });
                });
                
                Promise.all(clientesPromises)
                    .then(clientesConDatos => {
                        res.json({
                            data: clientesConDatos || [],
                            pagination: {
                                page: page,
                                limit: limit,
                                total: total,
                                totalPages: Math.ceil(total / limit)
                            }
                        });
                    })
                    .catch(err => {
                        res.status(500).json({ error: err.message });
                    });
            });
        });
    });

    app.post('/api/clientes', (req, res) => {
        const { nombre } = req.body;
        db.run(
            "INSERT INTO clientes (nombre) VALUES (?)", 
            [nombre], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, nombre });
            }
        );
    });

    app.put('/api/clientes/:id', (req, res) => {
        const { nombre } = req.body;
        const { id } = req.params;
        db.run(
            "UPDATE clientes SET nombre = ? WHERE id = ?", 
            [nombre, id], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ status: "ok" });
            }
        );
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
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const total = countResult?.total || 0;
            
            db.all(query, [...params, limit, offset], (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                res.json({
                    data: rows || [],
                    pagination: {
                        page: page,
                        limit: limit,
                        total: total,
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });

    app.post('/api/productos', (req, res) => {
        const { nombre, precio, stock, stock_minimo } = req.body;
        db.run(
            "INSERT INTO productos (nombre, precio_base, stock, stock_minimo) VALUES (?, ?, ?, ?)", 
            [nombre, precio, stock || 0, stock_minimo || 5], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    });

    app.put('/api/productos/:id', (req, res) => {
        const { nombre, precio } = req.body;
        const { id } = req.params;
        db.run(
            "UPDATE productos SET nombre = ?, precio_base = ? WHERE id = ?", 
            [nombre, precio, id], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ status: "ok" });
            }
        );
    });

    app.put('/api/productos/:id/stock', (req, res) => {
        const { id } = req.params;
        const { stock, stock_minimo } = req.body;
        
        let query = "UPDATE productos SET ";
        const params = [];
        
        if (stock !== undefined) {
            query += "stock = ?, ";
            params.push(stock);
        }
        if (stock_minimo !== undefined) {
            query += "stock_minimo = ?, ";
            params.push(stock_minimo);
        }
        
        query = query.slice(0, -2) + " WHERE id = ?";
        params.push(id);
        
        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ status: "ok", changes: this.changes });
        });
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

 // ==================== RUTAS DE VENTAS CON PAGINACIÓN ====================
app.get('/api/historial', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let countQuery = `
        SELECT COUNT(DISTINCT v.id) as total
        FROM ventas v
        JOIN clientes c ON v.cliente_id = c.id
    `;
    
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
        if (err) {
            console.error("Error en count:", err);
            return res.status(500).json({ error: err.message });
        }
        
        const total = countResult?.total || 0;
        
        db.all(query, [...queryParams, limit, offset], (err, rows) => {
            if (err) {
                console.error("Error en query:", err);
                return res.status(500).json({ error: err.message });
            }
            
            const ventas = (rows || []).map(v => {
                let fechaFormateada = '';
                
                if (v.fecha) {
                    try {
                        // Limpiar la fecha: eliminar espacios y tomar solo la parte de fecha
                        let fechaLimpia = v.fecha.toString().trim();
                        
                        // Si tiene espacio (ej: "2026-04-08 03:14:27"), tomar solo la primera parte
                        if (fechaLimpia.includes(' ')) {
                            fechaLimpia = fechaLimpia.split(' ')[0];
                        }
                        
                        // Formato YYYY-MM-DD a DD/MM/YYYY
                        if (fechaLimpia.includes('-')) {
                            const partes = fechaLimpia.split('-');
                            if (partes.length === 3) {
                                fechaFormateada = `${partes[2]}/${partes[1]}/${partes[0]}`;
                            } else {
                                fechaFormateada = fechaLimpia;
                            }
                        } else {
                            fechaFormateada = fechaLimpia;
                        }
                    } catch (e) {
                        console.error("Error formateando fecha:", v.fecha, e);
                        fechaFormateada = v.fecha;
                    }
                }
                
                return {
                    ...v,
                    fecha: fechaFormateada,
                    total: v.total || 0,
                    items: v.items || 0
                };
            });
            
            res.json({
                data: ventas,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        });
    });
});
app.post('/api/ventas', (req, res) => {
    const { cliente_id, items } = req.body;
    
    // Calcular el total de la venta
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
    
    Promise.all(checkStock)
        .then(() => {
            // Usar hora Colombia explícitamente
            const now = new Date();
            const colombiaOffset = -5 * 60 * 60 * 1000;
            const colombiaDate = new Date(now.getTime() + colombiaOffset);
            const fechaColombia = colombiaDate.toISOString().slice(0, 19).replace('T', ' ');
            
            db.run(
                "INSERT INTO ventas (cliente_id, fecha) VALUES (?, ?)", 
                [cliente_id, fechaColombia], 
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    const venta_id = this.lastID;
                    const stmt = db.prepare(
                        "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)"
                    );
                    
                    items.forEach(item => {
                        stmt.run(venta_id, item.id, item.cantidad, item.precio);
                        db.run("UPDATE productos SET stock = stock - ? WHERE id = ?", [item.cantidad, item.id]);
                    });
                    
                    stmt.finalize();
                    
                    // 🔥 ACTUALIZAR DEUDA DEL CLIENTE AUTOMÁTICAMENTE 🔥
                    db.run(`UPDATE clientes SET 
                        total_deuda = COALESCE(total_deuda, 0) + ?,
                        ultima_deuda = ?
                        WHERE id = ?`,
                        [totalVenta, fechaColombia, cliente_id],
                        (err) => {
                            if (err) console.error("Error actualizando deuda:", err);
                        });
                    
                    db.all("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0", [], (err, bajo) => {
                        db.all("SELECT * FROM productos WHERE stock = 0", [], (err, agotados) => {
                            res.json({ 
                                id: venta_id, 
                                status: "venta registrada",
                                deuda_agregada: totalVenta,
                                alertas: {
                                    stock_bajo: bajo || [],
                                    agotados: agotados || []
                                }
                            });
                        });
                    });
                }
            );
        })
        .catch(err => {
            res.status(400).json({ error: err.message });
        });
});
    app.delete('/api/ventas/:id', (req, res) => {
        const ventaId = req.params.id;
        
        db.serialize(() => {
            db.run("DELETE FROM detalle_ventas WHERE venta_id = ?", [ventaId]);
            db.run("DELETE FROM ventas WHERE id = ?", [ventaId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ status: "ok" });
            });
        });
    });

    // ==================== RUTA PARA OBTENER DETALLES DE UNA VENTA ====================
    app.get('/api/ventas/:id/detalles', (req, res) => {
        const ventaId = req.params.id;
        
        const query = `
            SELECT d.cantidad, d.precio_final, p.nombre
            FROM detalle_ventas d
            JOIN productos p ON d.producto_id = p.id
            WHERE d.venta_id = ?
        `;
        
        db.all(query, [ventaId], (err, rows) => {
            if (err) {
                console.error("Error obteniendo detalles:", err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        });
    });

    // ==================== RUTA PARA ACTUALIZAR UNA VENTA (EDITAR) ====================
    app.put('/api/ventas/:id', (req, res) => {
        const ventaId = req.params.id;
        const { cliente_id, items } = req.body;
        
        console.log("📝 Actualizando venta ID:", ventaId, "con items:", items);
        
        // Primero, verificar stock disponible para los nuevos items
        const checkStock = items.map(item => {
            return new Promise((resolve, reject) => {
                db.get("SELECT nombre, stock FROM productos WHERE id = ?", [item.id], (err, row) => {
                    if (err) reject(err);
                    if (!row) reject(new Error('Producto no encontrado'));
                    if (row.stock < item.cantidad) {
                        reject(new Error(`Stock insuficiente para ${row.nombre}. Disponible: ${row.stock}`));
                    }
                    resolve(row);
                });
            });
        });
        
        Promise.all(checkStock)
            .then(() => {
                // Iniciar transacción
                db.serialize(() => {
                    // 1. Obtener los detalles antiguos para devolver el stock
                    db.all("SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?", [ventaId], (err, oldItems) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }
                        
                        console.log("🔄 Devolviendo stock de items antiguos:", oldItems);
                        
                        // 2. Devolver el stock de los productos antiguos
                        oldItems.forEach(oldItem => {
                            db.run("UPDATE productos SET stock = stock + ? WHERE id = ?", [oldItem.cantidad, oldItem.producto_id]);
                        });
                        
                        // 3. Eliminar detalles antiguos
                        db.run("DELETE FROM detalle_ventas WHERE venta_id = ?", [ventaId], (err) => {
                            if (err) {
                                return res.status(500).json({ error: err.message });
                            }
                            
                            // 4. Insertar nuevos detalles
                            const stmt = db.prepare(
                                "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)"
                            );
                            
                            items.forEach(item => {
                                stmt.run(ventaId, item.id, item.cantidad, item.precio);
                                // 5. Restar el nuevo stock
                                db.run("UPDATE productos SET stock = stock - ? WHERE id = ?", [item.cantidad, item.id]);
                            });
                            
                            stmt.finalize();
                            
                            // 6. Actualizar la fecha de la venta (opcional, para mantener la fecha actual)
                            db.run("UPDATE ventas SET fecha = CURRENT_TIMESTAMP WHERE id = ?", [ventaId], (err) => {
                                if (err) {
                                    return res.status(500).json({ error: err.message });
                                }
                                
                                // 7. Obtener alertas de stock
                                db.all("SELECT * FROM productos WHERE stock <= stock_minimo AND stock > 0", [], (err, bajo) => {
                                    db.all("SELECT * FROM productos WHERE stock = 0", [], (err, agotados) => {
                                        res.json({ 
                                            id: ventaId, 
                                            status: "venta actualizada",
                                            alertas: {
                                                stock_bajo: bajo || [],
                                                agotados: agotados || []
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            })
            .catch(err => {
                console.error("Error actualizando venta:", err);
                res.status(400).json({ error: err.message });
            });
    });

   // ==================== RUTAS PARA ESTADÍSTICAS DEL DASHBOARD (CORREGIDO) ====================
app.get('/api/estadisticas', (req, res) => {
    // Obtener fecha actual en COLOMBIA (UTC-5)
    const now = new Date();
    const colombiaOffset = -5 * 60; // UTC-5 en minutos
    const colombiaDate = new Date(now.getTime() + (colombiaOffset * 60 * 1000));
    
    // Formatear fecha para SQLite (YYYY-MM-DD)
    const yearCol = colombiaDate.getUTCFullYear();
    const monthCol = String(colombiaDate.getUTCMonth() + 1).padStart(2, '0');
    const dayCol = String(colombiaDate.getUTCDate()).padStart(2, '0');
    const todayColombia = `${yearCol}-${monthCol}-${dayCol}`;
    const currentMonth = monthCol;
    const currentYear = yearCol;
    

    // Query ventas últimos 7 días (usando la fecha Colombia como referencia)
    const queryVentas7Dias = `
        SELECT date(v.fecha) as fecha, 
               COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v
        JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE date(v.fecha) >= date('${todayColombia}', '-7 days')
        GROUP BY date(v.fecha)
        ORDER BY fecha ASC
    `;
    
    // Query productos más vendidos
    const queryProductosTop = `
        SELECT p.nombre, 
               COALESCE(SUM(d.cantidad), 0) as cantidad, 
               COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM detalle_ventas d
        JOIN productos p ON d.producto_id = p.id
        GROUP BY d.producto_id
        ORDER BY cantidad DESC
        LIMIT 5
    `;
    
    // Query ventas del mes actual (SOLO este mes y año)
    const queryVentasMes = `
        SELECT COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v
        JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE strftime('%m', v.fecha) = '${currentMonth}'
        AND strftime('%Y', v.fecha) = '${currentYear}'
    `;
    
    // Query ventas de hoy
    const queryVentasHoy = `
        SELECT COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM ventas v
        JOIN detalle_ventas d ON v.id = d.venta_id
        WHERE date(v.fecha) = '${todayColombia}'
    `;
    
    // Query mejores clientes
    const queryMejoresClientes = `
        SELECT c.nombre, 
               COUNT(DISTINCT v.id) as compras,
               COALESCE(SUM(d.cantidad * d.precio_final), 0) as total
        FROM clientes c
        LEFT JOIN ventas v ON c.id = v.cliente_id
        LEFT JOIN detalle_ventas d ON v.id = d.venta_id
        GROUP BY c.id
        ORDER BY total DESC
        LIMIT 5
    `;
    
    Promise.all([
        new Promise((resolve, reject) => {
            db.all(queryVentas7Dias, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        }),
        new Promise((resolve, reject) => {
            db.all(queryProductosTop, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        }),
        new Promise((resolve, reject) => {
            db.get(queryVentasMes, [], (err, row) => {
                if (err) reject(err);
                else resolve(row?.total || 0);
            });
        }),
        new Promise((resolve, reject) => {
            db.get(queryVentasHoy, [], (err, row) => {
                if (err) reject(err);
                else resolve(row?.total || 0);
            });
        }),
        new Promise((resolve, reject) => {
            db.all(queryMejoresClientes, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        })
    ]).then(([ventas7Dias, productosTop, ventasMes, ventasHoy, mejoresClientes]) => {
        res.json({
            ventas7Dias,
            productosTop,
            ventasMes,
            ventasHoy,
            mejoresClientes
        });
    }).catch(err => {
        console.error("Error en estadísticas:", err);
        res.status(500).json({ error: err.message });
    });
});
    // ==================== RUTA PRINCIPAL ====================
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3011;

app.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------------');
    console.log(`🚀 Manager Pro corriendo en:`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log('-----------------------------------------');

    const url = `http://localhost:${PORT}`;
    const start = process.platform === 'win32' ? 'start' : 
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
    
    exec(`${start} ${url}`);
});