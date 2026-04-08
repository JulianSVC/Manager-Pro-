const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Configuración (DEBE ser la misma que en tu index.js)
const LICENCIA_SECRETA = 'MANAGER_PRO_2024_CLAVE_SECRETA';
const LICENCIA_FILE = path.join(__dirname, 'license.key');

// Tu HWID (el que te muestra la pantalla)
const HWID_CLIENTE = '54006198d18d8e14721c85f51536b4318e2f822cc71d48b5eefed98ca968bea3';

console.log('========================================');
console.log('🔐 GENERADOR DE LICENCIA MANAGER PRO');
console.log('========================================\n');

console.log('📋 HWID del cliente:');
console.log(HWID_CLIENTE);
console.log('\n');

// Generar licencia (primeros 20 caracteres del hash)
const licencia = crypto
    .createHash('sha256')
    .update(LICENCIA_SECRETA + '_' + HWID_CLIENTE)
    .digest('hex')
    .substring(0, 20)
    .toUpperCase();

console.log('✅ LICENCIA GENERADA:');
console.log('=======================');
console.log(licencia);
console.log('=======================\n');

// Preguntar si quiere guardarla
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

readline.question('¿Guardar esta licencia en license.key? (s/n): ', (respuesta) => {
    if (respuesta.toLowerCase() === 's') {
        fs.writeFileSync(LICENCIA_FILE, licencia);
        console.log('\n✅ Licencia guardada en license.key');
        console.log('🔄 Reinicia el programa para usar el sistema');
    } else {
        console.log('\n📝 Licencia no guardada');
    }
    readline.close();
});