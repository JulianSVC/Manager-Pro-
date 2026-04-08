const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 CONSTRUYENDO MANAGER PRO v1.0.0');
console.log('====================================');

// Colores para consola
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, type = 'info') {
    const prefix = {
        info: `${colors.cyan}ℹ${colors.reset}`,
        success: `${colors.green}✅${colors.reset}`,
        warning: `${colors.yellow}⚠${colors.reset}`,
        error: `${colors.red}❌${colors.reset}`
    };
    console.log(`${prefix[type] || prefix.info} ${message}`);
}

// Paso 1: Verificar estructura
log('Verificando estructura de archivos...', 'info');

// Crear carpeta dist si no existe
if (!fs.existsSync('./dist')) {
    fs.mkdirSync('./dist');
    log('Carpeta dist creada', 'success');
}

// Verificar archivos necesarios
const archivosRequeridos = [
    { path: './index.js', nombre: 'Servidor principal' },
    { path: './public/index.html', nombre: 'Página principal' },
    { path: './public/activar.html', nombre: 'Página de activación' },
    { path: './package.json', nombre: 'Configuración' }
];

let todosOK = true;
archivosRequeridos.forEach(archivo => {
    if (fs.existsSync(archivo.path)) {
        const stats = fs.statSync(archivo.path);
        log(`${archivo.nombre}: ${(stats.size / 1024).toFixed(2)} KB`, 'success');
    } else {
        log(`FALTA: ${archivo.nombre} (${archivo.path})`, 'error');
        todosOK = false;
    }
});

if (!todosOK) {
    log('No se puede continuar por archivos faltantes', 'error');
    process.exit(1);
}

// Paso 2: Instalar dependencias si es necesario
log('\nVerificando dependencias...', 'info');

if (!fs.existsSync('./node_modules')) {
    log('Instalando dependencias (puede tomar un momento)...', 'warning');
    
    exec('npm install', (error, stdout, stderr) => {
        if (error) {
            log('Error instalando dependencias', 'error');
            console.error(error);
            process.exit(1);
        }
        log('Dependencias instaladas correctamente', 'success');
        compilarEjecutable();
    });
} else {
    log('Dependencias ya instaladas', 'success');
    compilarEjecutable();
}

function compilarEjecutable() {
    log('\n🚀 GENERANDO EJECUTABLE...', 'info');
    log('Esto puede tomar varios minutos', 'warning');
    
    // Usar pkg local (npx)
    const comando = 'npx pkg package.json --targets node18-win-x64 --output dist/ManagerPro.exe';
    
    log(`Ejecutando: ${comando}`, 'info');
    
    exec(comando, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
        if (error) {
            log('Método con package.json falló, intentando método alternativo...', 'warning');
            
            // Método alternativo
            const comando2 = 'npx pkg index.js --targets node18-win-x64 --output dist/ManagerPro.exe';
            
            exec(comando2, { maxBuffer: 1024 * 1024 * 50 }, (error2, stdout2, stderr2) => {
                if (error2) {
                    log('ERROR: No se pudo generar el ejecutable', 'error');
                    console.error(error2);
                    return;
                }
                
                if (stderr2) {
                    log('Advertencias:', 'warning');
                    console.log(stderr2);
                }
                
                finalizarCompilacion();
            });
        } else {
            if (stderr) {
                log('Advertencias:', 'warning');
                console.log(stderr);
            }
            
            finalizarCompilacion();
        }
    });
}

function finalizarCompilacion() {
    // Verificar que el ejecutable se creó
    const exePath = './dist/ManagerPro.exe';
    
    if (fs.existsSync(exePath)) {
        const stats = fs.statSync(exePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        log('\n====================================', 'success');
        log('✅ ¡EJECUTABLE CREADO EXITOSAMENTE!', 'success');
        log('====================================', 'success');
        log(`📁 Ubicación: ${path.resolve('./dist/ManagerPro.exe')}`, 'info');
        log(`📦 Tamaño: ${sizeMB} MB`, 'info');
        
        // Crear archivos para distribución
        crearArchivosDistribucion();
        
    } else {
        log('❌ No se pudo encontrar el ejecutable', 'error');
    }
}

function crearArchivosDistribucion() {
    // Crear README para el cliente
    const readme = `MANAGER PRO - SISTEMA DE PUNTO DE VENTA
=====================================

📋 INSTRUCCIONES DE INSTALACIÓN:
-------------------------------------
1. Copia la carpeta completa a cualquier lugar de tu PC
2. Ejecuta el archivo "ManagerPro.exe"
3. El programa se abrirá automáticamente en tu navegador
4. Si no se abre, ve a: http://localhost:3011

🔐 ACTIVACIÓN:
-------------------------------------
La primera vez que ejecutes el programa, verás un código HWID.
Envíalo por WhatsApp al número que te proporcionó el vendedor
para recibir tu licencia de activación.

📁 ARCHIVOS IMPORTANTES:
-------------------------------------
- manager.db: Base de datos (NO ELIMINAR)
- license.key: Archivo de licencia (se crea al activar)

⚙️ REQUISITOS MÍNIMOS:
-------------------------------------
- Windows 7, 8, 10 u 11 (64 bits)
- 2 GB de RAM
- 100 MB de espacio en disco

❓ SOPORTE TÉCNICO:
-------------------------------------
WhatsApp: +57 312 345 6789
Email: soporte@managerpro.co

© 2024 Manager Pro - Todos los derechos reservados
`;
    
    fs.writeFileSync('./dist/README.txt', readme);
    log('README.txt creado para el cliente', 'success');
    
    // Crear script de inicio rápido
    const startup = `@echo off
echo =====================================
echo    MANAGER PRO - INICIANDO...
echo =====================================
echo.
echo El programa se abrira en tu navegador
echo Si no se abre, ve a: http://localhost:3011
echo.
start "" "ManagerPro.exe"
echo.
echo Presiona cualquier tecla para cerrar...
pause > nul`;
    
    fs.writeFileSync('./dist/Iniciar Manager.bat', startup);
    log('Script de inicio creado', 'success');
    
    // Crear archivo de configuración
    const config = `{
    "version": "1.0.0",
    "puerto": 3011,
    "nombre": "Manager Pro",
    "auto_abrir": true
}`;
    
    fs.writeFileSync('./dist/config.json', config);
    log('Archivo de configuración creado', 'success');
    
    log('\n📋 INSTRUCCIONES PARA DISTRIBUIR:', 'info');
    log('1. La carpeta dist/ contiene el programa completo', 'info');
    log('2. Comprime toda la carpeta dist/ y envíala al cliente', 'info');
    log('3. El cliente solo necesita extraer y ejecutar "Iniciar Manager.bat"', 'info');
    
    log('\n✅ PROCESO COMPLETADO', 'success');
}