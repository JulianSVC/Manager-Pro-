const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database('./manager.db');

const clientes = [
    'Carmenza Rodríguez',
    'María González',
    'Juan Pérez',
    'Ana Martínez',
    'Carlos López',
    'Luisa Fernández',
    'Pedro Ramírez',
    'Diana Castro',
    'Andrés Torres',
    'Laura Medina',
    'Roberto Sánchez',
    'Patricia Herrera',
    'Fernando Ruiz',
    'Gabriela Silva',
    'Diego Vargas'
];

const productos = [
    { nombre: 'BLUSA DAMA', precio: 45000, stock: 25, stock_minimo: 5 },
    { nombre: 'JEANS CABALLERO', precio: 85000, stock: 30, stock_minimo: 8 },
    { nombre: 'VESTIDO NOCHE', precio: 120000, stock: 12, stock_minimo: 3 },
    { nombre: 'CAMISA MANGA LARGA', precio: 65000, stock: 18, stock_minimo: 5 },
    { nombre: 'FALDA JEAN', precio: 55000, stock: 22, stock_minimo: 6 },
    { nombre: 'CHAQUETA CUERO', precio: 250000, stock: 8, stock_minimo: 2 },
    { nombre: 'ZAPATOS TACÓN', precio: 95000, stock: 15, stock_minimo: 4 },
    { nombre: 'TENIS DEPORTIVOS', precio: 120000, stock: 20, stock_minimo: 5 },
    { nombre: 'GORRA BASEBALL', precio: 25000, stock: 35, stock_minimo: 10 },
    { nombre: 'BUFANDA LANA', precio: 32000, stock: 12, stock_minimo: 3 },
    { nombre: 'JEANS DAMA', precio: 75000, stock: 28, stock_minimo: 7 },
    { nombre: 'BLUSA CASUAL', precio: 38000, stock: 40, stock_minimo: 10 },
    { nombre: 'PANTALÓN VESTIR', precio: 110000, stock: 14, stock_minimo: 4 },
    { nombre: 'CORBATA SEDA', precio: 45000, stock: 10, stock_minimo: 2 },
    { nombre: 'CINTURÓN CUERO', precio: 35000, stock: 25, stock_minimo: 5 }
];

function randomDate() {
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(now.setDate(now.getDate() - daysAgo));
    return date.toISOString().split('T')[0] + ' ' + 
           date.toTimeString().split(' ')[0];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

console.log('🌱 Sembrando datos de ejemplo...\n');

db.serialize(() => {
    console.log('📦 Verificando tablas...');
    
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
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS detalle_ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        venta_id INTEGER, 
        producto_id INTEGER, 
        cantidad INTEGER, 
        precio_final REAL
    )`);

    // Limpiar datos existentes
    db.run("DELETE FROM detalle_ventas");
    db.run("DELETE FROM ventas");
    db.run("DELETE FROM productos");
    db.run("DELETE FROM clientes");
    
    console.log('✅ Tablas limpias\n');

    // Insertar clientes
    console.log('📝 Insertando clientes...');
    const stmtCliente = db.prepare("INSERT INTO clientes (nombre) VALUES (?)");
    clientes.forEach(nombre => stmtCliente.run(nombre));
    stmtCliente.finalize();
    console.log(`✅ ${clientes.length} clientes insertados`);

    // Insertar productos
    console.log('\n📦 Insertando productos...');
    const stmtProducto = db.prepare(
        "INSERT INTO productos (nombre, precio_base, stock, stock_minimo) VALUES (?, ?, ?, ?)"
    );
    productos.forEach(p => stmtProducto.run(p.nombre, p.precio, p.stock, p.stock_minimo));
    stmtProducto.finalize();
    console.log(`✅ ${productos.length} productos insertados`);

    db.all("SELECT id FROM clientes", [], (err, clientesIds) => {
        db.all("SELECT id, precio_base FROM productos", [], (err, productosIds) => {
            
            const numVentas = randomInt(25, 35);
            console.log(`\n💰 Creando ${numVentas} ventas...`);
            
            let ventasCreadas = 0;
            
            for (let i = 0; i < numVentas; i++) {
                const clienteId = clientesIds[randomInt(0, clientesIds.length - 1)].id;
                const fecha = randomDate();
                
                db.run(
                    "INSERT INTO ventas (cliente_id, fecha) VALUES (?, ?)",
                    [clienteId, fecha],
                    function(err) {
                        if (err) {
                            console.error('Error creando venta:', err);
                            return;
                        }
                        
                        const ventaId = this.lastID;
                        const numItems = randomInt(1, 5);
                        
                        for (let j = 0; j < numItems; j++) {
                            const producto = productosIds[randomInt(0, productosIds.length - 1)];
                            const cantidad = randomInt(1, 4);
                            
                            db.run(
                                "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_final) VALUES (?, ?, ?, ?)",
                                [ventaId, producto.id, cantidad, producto.precio_base]
                            );
                            
                            db.run(
                                "UPDATE productos SET stock = stock - ? WHERE id = ?",
                                [cantidad, producto.id]
                            );
                        }
                        
                        ventasCreadas++;
                        
                        if (ventasCreadas === numVentas) {
                            console.log(`✅ ${numVentas} ventas creadas`);
                            console.log('\n✨ Base de datos poblada exitosamente!\n');
                            
                            setTimeout(() => {
                                db.all("SELECT COUNT(*) as total FROM clientes", [], (err, res) => {
                                    console.log(`📊 Total clientes: ${res[0].total}`);
                                });
                                db.all("SELECT COUNT(*) as total FROM productos", [], (err, res) => {
                                    console.log(`📊 Total productos: ${res[0].total}`);
                                });
                                db.all("SELECT COUNT(*) as total FROM ventas", [], (err, res) => {
                                    console.log(`📊 Total ventas: ${res[0].total}`);
                                    db.close();
                                });
                            }, 500);
                        }
                    }
                );
            }
        });
    });
});