const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

function createIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2);
    ctx.fill();

    // 绘制时钟指针
    const center = size / 2;
    const scale = size / 128;

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5 * scale;
    ctx.lineCap = 'round';

    // 时针 (指向12点)
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center, center - 32 * scale);
    ctx.stroke();

    // 分针 (指向3点)
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + 24 * scale, center);
    ctx.stroke();

    // 中心点
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(center, center, 5 * scale, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer('image/png');
}

const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

// 生成不同尺寸的图标
fs.writeFileSync(path.join(iconsDir, 'icon16.png'), createIcon(16));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), createIcon(48));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), createIcon(128));

console.log('✓ 图标生成成功！');
