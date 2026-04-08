// test-licencia.js
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const LICENCIA_SECRETA = 'MANAGER_PRO_2024_CLAVE_SECRETA';
const LICENCIA_FILE = path.join(__dirname, 'license.key');

// Copia la función getHardwareId de tu index.js
function getHardwareId() {
    try {
        const cpus = os.cpus();
        const networkInterfaces = os.networkInterfaces();
        
        let macAddress = 'NO-MAC';
        const interfaces = networkInterfaces;
        for (let iface in interfaces) {
            if (iface.includes('Ethernet') || iface.includes('eth')) {
                macAddress = interfaces[iface][0]?.mac || macAddress;
                break;
            }
        }
        
        if (macAddress === 'NO-MAC') {
            for (let iface in interfaces) {
                macAddress = interfaces[iface][0]?.mac || macAddress;
                if (macAddress !== 'NO-MAC') break;
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
        console.error('Error:', error);
        return null;
    }
}

// Función para generar licencia (la CORREGIDA)
function generarLicenciaParaCliente(hardwareIdCliente) {
    if (!hardwareIdCliente) return null;
    
    const licencia = crypto
        .createHash('sha256')
        .update(LICENCIA_SECRETA + '_' + hardwareIdCliente)
        .digest('hex')
        .substring(0, 20)
        .toUpperCase();
    
    return licencia;
}

// --- PRUEBAS ---
console.log('🔬 PRUEBA DEL SISTEMA DE LICENCIAS\n');
console.log('=====================================\n');

// 1. Obtener HWID de esta PC
const miHwid = getHardwareId();
console.log('🖥️  MI HARDWARE ID:');
console.log(miHwid);
console.log();

// 2. SIMULAR: Un cliente te envía su HWID (usamos el mismo para prueba)
const hwidCliente = miHwid; // En la vida real, esto te lo envía el cliente
console.log('📱 HWID DEL CLIENTE (simulado):');
console.log(hwidCliente);
console.log();

// 3. TÚ generas la licencia para ese cliente
const licenciaGenerada = generarLicenciaParaCliente(hwidCliente);
console.log('🎟️  LICENCIA QUE LE DAS AL CLIENTE:');
console.log(licenciaGenerada);
console.log();

// 4. SIMULAR: El cliente ingresa la licencia en su PC
console.log('🔐 VERIFICANDO LICENCIA...');
const licenciaEsperada = crypto
    .createHash('sha256')
    .update(LICENCIA_SECRETA + '_' + hwidCliente)
    .digest('hex')
    .substring(0, 20)
    .toUpperCase();

if (licenciaGenerada === licenciaEsperada) {
    console.log('✅ ¡LICENCIA VÁLIDA! El cliente puede activar');
    
    // Simular guardar archivo
    fs.writeFileSync('license.test', licenciaGenerada);
    console.log('📁 Archivo license.test creado');
} else {
    console.log('❌ Licencia inválida');
}

console.log('\n=====================================');
console.log('📋 INSTRUCCIONES PARA PROBAR EL .exe:');
console.log('=====================================');
console.log('1. Ejecuta: node test-licencia.js');
console.log('2. Verás tu HWID y la licencia generada');
console.log('3. Borra license.key si existe');
console.log('4. Ejecuta ManagerPro.exe - DEBERÍA PEDIR ACTIVACIÓN');
console.log('5. Usa la licencia generada para activar');
console.log('6. Vuelve a ejecutar - DEBERÍA ENTRAR DIRECTO');