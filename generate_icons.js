const fs = require('fs');
const path = require('path');

// 简单的 1x1 像素 PNG header + 紫色像素
// 这只是一个极其基础的生成脚本，生成简单的纯色块图标用于测试
// 实际生产环境应该使用真实的图片资源

function createPNG(size, colorHex) {
    // 这是一个简化版的 PNG 生成器，仅用于生成非压缩的纯色矩形
    // 为了确保可靠性，我们这里使用一个预生成的紫色正方形 PNG 的 Base64
    // 这样比手写二进制更安全

    // 16x16 紫色方块
    const icon16 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAEUlEQVR42mN88eL/fwYiAOMAAKt7D+klrQ7AAAAAAElFTkSuQmCC', 'base64');

    // 48x48 紫色方块
    const icon48 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAF0lEQVR42mN88eL/fwYiHOMGjBowagAA038P6dw8/QAAAAAASUVORK5CYII=', 'base64');

    // 128x128 紫色方块
    const icon128 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAYUlEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/BwqUAAB+243+AAAAABJRU5ErkJggg==', 'base64');

    if (size === 16) return icon16;
    if (size === 48) return icon48;
    return icon128;
}

const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

// 生成 PNG 文件
fs.writeFileSync(path.join(iconsDir, 'icon16.png'), createPNG(16, '667eea'));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), createPNG(48, '667eea'));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), createPNG(128, '667eea'));

console.log('PNG Icons generated successfully.');
