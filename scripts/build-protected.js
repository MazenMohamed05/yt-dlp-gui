const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.resolve(__dirname, '..');
const mainPath = path.join(rootDir, 'main.js');
const preloadPath = path.join(rootDir, 'preload.js');
const mainBakPath = path.join(rootDir, 'main.js.bak');
const preloadBakPath = path.join(rootDir, 'preload.js.bak');

console.log('🔒 Starting Protected Build Pipeline...');

const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    target: 'node'
};

let backedUp = false;

function restoreOriginals() {
    if (backedUp) {
        console.log('🔄 Restoring original clean source files in developer workspace...');
        try {
            if (fs.existsSync(mainBakPath)) {
                fs.copyFileSync(mainBakPath, mainPath);
                fs.unlinkSync(mainBakPath);
            }
            if (fs.existsSync(preloadBakPath)) {
                fs.copyFileSync(preloadBakPath, preloadPath);
                fs.unlinkSync(preloadBakPath);
            }
            console.log('✅ Workspace restored to original clean code.');
        } catch (e) {
            console.error('⚠️ Error during restore:', e.message);
        }
        backedUp = false;
    }
}

// Ensure restore runs even if user presses Ctrl+C or process terminates
process.on('SIGINT', () => {
    console.log('\n🛑 Build interrupted by user (SIGINT).');
    restoreOriginals();
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Build terminated (SIGTERM).');
    restoreOriginals();
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught exception:', err);
    restoreOriginals();
    process.exit(1);
});

try {
    // 1. Backup original files safely (never overwrite a backup if one already exists)
    console.log('📦 Backing up original source files...');
    if (!fs.existsSync(mainBakPath)) {
        fs.copyFileSync(mainPath, mainBakPath);
    }
    if (!fs.existsSync(preloadBakPath)) {
        fs.copyFileSync(preloadPath, preloadBakPath);
    }
    backedUp = true;

    // 2. Obfuscate main.js
    console.log('🛡️ Obfuscating main.js...');
    const originalMain = fs.readFileSync(mainBakPath, 'utf8');
    const obfuscatedMain = JavaScriptObfuscator.obfuscate(originalMain, obfuscatorOptions).getObfuscatedCode();
    fs.writeFileSync(mainPath, obfuscatedMain, 'utf8');

    // 3. Obfuscate preload.js
    console.log('🛡️ Obfuscating preload.js...');
    const originalPreload = fs.readFileSync(preloadBakPath, 'utf8');
    const obfuscatedPreload = JavaScriptObfuscator.obfuscate(originalPreload, obfuscatorOptions).getObfuscatedCode();
    fs.writeFileSync(preloadPath, obfuscatedPreload, 'utf8');

    console.log('🚀 Running electron-builder to package protected installer...');
    
    // 4. Run electron-builder
    const builderCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(builderCmd, ['electron-builder', '--win'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true
    });

    if (result.status !== 0) {
        throw new Error(`electron-builder exited with code ${result.status}`);
    }

    console.log('✨ Build completed successfully with protected code!');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exitCode = 1;
} finally {
    // 5. Always restore original files so developer workspace stays clean and readable
    restoreOriginals();
}

